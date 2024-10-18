import { Validator } from '@cfworker/json-schema';
import { SCHEMA } from '../constants';
import { hasClientToken, isValidAuthHeader, verifyToken } from '../helpers';
import { decrypt } from '../lib/aes-gcm';
import { hash } from '../lib/hashUtils';
import { getCastByHash } from '../lib/hub';
import { listEnabledChannels } from '../lib/redis';
import { CFContext, EncryptedPacket, ExternalData, ExternalDataSchema } from '../types';
import { checkEligibility } from '../utils/perms';
import { GetDecryptedDataArgs, GetDecryptedMessageByFidArgs, GetDecryptedMessagesByFidArgs, GetTextByCastHashArgs } from './types';

export const Query = {
	heartbeat: () => true,
	isPrePermissionless: (_: any, { fid }: { fid: number }) => {
		return fid === undefined ? false : fid < 20939;
	},
	getEnabledChannels: async () => {
		try {
			const res = await listEnabledChannels();
			return res;
		} catch (error) {
			console.error('Error in getEnabledChannels:', error);
			throw new Error('Failed to retrieve enabled channels');
		}
	},
	getEncryptedData: async (_: any, { limit = 10 }: { limit?: number }, { env }: CFContext) => {
		try {
			const sqlStatement = `
                SELECT
                    obscured_message_id,
                    salted_hashed_fid,
                    shifted_timestamp,
                    encrypted_message,
                    obscured_hashed_text
                FROM stored_data
                WHERE schema_version = '${SCHEMA}'
                ORDER BY ROWID DESC
                LIMIT ?
            `;

			const stmt = env.D1.prepare(sqlStatement).bind(limit);
			const result = await stmt.all<{
				obscured_message_id: string;
				salted_hashed_fid: string;
				shifted_timestamp: number;
				encrypted_message: string;
				obscured_hashed_text: string;
			}>();
			const rows = result.results.map((row) => {
				return {
					messageId: row.obscured_message_id,
					who: row.salted_hashed_fid,
					when: row.shifted_timestamp,
					what: row.encrypted_message,
					how: row.obscured_hashed_text,
				};
			});
			return { rows };
		} catch (error) {
			console.error('Error in getEncryptedData:', error);
			throw new Error('Failed to retrieve data');
		}
	},
	getDecryptedData: async (_: any, { messageId, bearerToken, secret, salt }: GetDecryptedDataArgs, { env, request }: CFContext) => {
		const verified = await verifyToken(bearerToken);
		const isTokenValid = await isValidAuthHeader(request.headers);
		if (!verified && !isTokenValid) {
			throw new Error('Invalid or expired token');
		}

		try {
			// Use provided { secret, salt, shift }, or fallback to ctx.env values
			const effectiveSecret = secret || env.SECRET;
			const effectiveSalt = salt || env.SALT;

			// Obscure the message hash for database lookup
			const obscuredMessageHash = await hash(messageId, effectiveSalt);

			// Prepare and execute the SQL query
			const sqlStatement = `
                SELECT encrypted_message 
                FROM stored_data 
                WHERE obscured_message_id = ?
                AND schema_version = '${SCHEMA}'
            `;
			const stmt = env.D1.prepare(sqlStatement).bind(obscuredMessageHash);
			const result = await stmt.first<{
				encrypted_message: string;
			}>();

			if (!result) {
				throw new Error('Data not found');
			}

			// Decrypt the data
			const message = await decrypt(JSON.parse(result.encrypted_message) as EncryptedPacket, effectiveSecret);
			const messageObj = JSON.parse(message) as ExternalData;
			const validator = new Validator(ExternalDataSchema);
			const res = validator.validate(messageObj);
			if (!res.valid) {
				console.error('Invalid message:', res.errors);
			}

			// Return the decrypted data
			return messageObj;
		} catch (error) {
			console.error('Error in getDecryptedData:', error);
			throw new Error('Failed to retrieve or decrypt data');
		}
	},
	getDecryptedMessagesByFid: async (
		_: any,
		{ fid, bearerToken, limit = 10, sortOrder = { asc: true }, secret, salt, shift }: GetDecryptedMessagesByFidArgs,
		{ env, request }: CFContext
	) => {
		const verified = await verifyToken(bearerToken);
		const isTokenValid = await isValidAuthHeader(request.headers);
		if (!verified && !isTokenValid) {
			throw new Error('Invalid or expired token');
		}

		try {
			// Use provided { secret, salt, shift }, or fallback to ctx.env values
			const effectiveSecret = secret || env.SECRET;
			const effectiveSalt = salt || env.SALT;
			const effectiveShift = shift || env.SHIFT;

			const saltedHashedFid = await hash(fid.toString(), effectiveSalt);

			let sqlStatement = `
                SELECT
                    shifted_timestamp,
                    encrypted_message
                FROM stored_data 
                WHERE salted_hashed_fid = ?
                AND schema_version = '${SCHEMA}'
                ORDER BY shifted_timestamp ${sortOrder.asc ? 'ASC' : 'DESC'}
            `;
			const params = [saltedHashedFid];

			sqlStatement += ' LIMIT ?';
			params.push((limit + 1).toString()); // Fetch one extra to determine if there are more results

			const stmt = env.D1.prepare(sqlStatement).bind(...params);
			const results = (
				await stmt.all<{
					shifted_timestamp: string;
					encrypted_message: string;
				}>()
			).results;

			const messages = [];
			let nextCursor = null;

			for (let i = 0; i < Math.min(results.length, limit); i++) {
				const result = results[i];
				const encryptedMessage = JSON.parse(result.encrypted_message) as EncryptedPacket;
				const messageStr = await decrypt(encryptedMessage, effectiveSecret);
				const messageObj = JSON.parse(messageStr);

				messages.push({
					messageHash: messageObj.messageHash,
					fid,
					timestamp: (BigInt(result.shifted_timestamp) + BigInt(effectiveShift)).toString(),
					text: messageObj.text,
				});
			}

			if (results.length > limit) {
				nextCursor = results[limit - 1].shifted_timestamp.toString();
			}

			return {
				messages,
				nextCursor,
			};
		} catch (error) {
			console.error('Error in getDecryptedMessagesByFid:', error);
			throw new Error('Failed to retrieve or decrypt messages');
		}
	},
	getDecryptedMessageByFid: async (
		_: any,
		{ fid, encodedText, bearerToken, secret, salt, shift }: GetDecryptedMessageByFidArgs,
		{ env, request }: CFContext
	) => {
		const verified = await verifyToken(bearerToken);
		const isTokenValid = await isValidAuthHeader(request.headers);
		if (!verified && !isTokenValid) {
			throw new Error('Invalid or expired token');
		}

		try {
			// Use provided { secret, salt, shift }, or fallback to ctx.env values
			const effectiveSecret = secret || env.SECRET;
			const effectiveSalt = salt || env.SALT;

			const saltedHashedFid = await hash(fid.toString(), effectiveSalt);
			const obscuredEncodedText = await hash(encodedText, effectiveSalt);

			const sqlStatement = `
                SELECT
                    shifted_timestamp,
                    encrypted_message
                FROM stored_data 
                WHERE salted_hashed_fid = $1
                    AND obscured_hashed_text = $2
                    AND schema_version = '${SCHEMA}'
            `;

			const stmt = env.D1.prepare(sqlStatement).bind([saltedHashedFid, obscuredEncodedText]);
			const result = await stmt.first<{
				shifted_timestamp: string;
				encrypted_message: string;
			}>();

			if (!result) {
				return undefined;
			}

			const encryptedMessage = JSON.parse(result.encrypted_message) as EncryptedPacket;
			const messageStr = await decrypt(encryptedMessage, effectiveSecret);
			const messageObj = JSON.parse(messageStr) as ExternalData;

			return messageObj;
		} catch (error) {
			console.error('Error in getDecryptedMessageByFid:', error);
			throw new Error('Failed to retrieve or decrypt messages');
		}
	},
	getTextByCastHash: async (_: any, { castHash, viewerFid, secret, salt, shift }: GetTextByCastHashArgs, { env, request }: CFContext) => {
		const isFcClient = await hasClientToken(request.headers);
		if (!isFcClient) {
			throw new Error('Invalid or expired token');
		}
		const castObject = await getCastByHash(castHash, env);
		if (!castObject) {
			throw new Error('Cast not found');
		}

		// if cast has a Keccak256 hash AND viewerFid has access to the cast
		// 		 decrypt and return the cast
		// else
		// 	 return the cast

		const isCastOwner = castObject.author.fid === viewerFid;
		const hasKeccak256HashRe = castObject.text.match(/[a-fA-F0-9]{64}/); // Regular expression to find a Keccak256 hash
		const keccak256Hash = hasKeccak256HashRe ? hasKeccak256HashRe[0] : null; // Extract the hash or set to null if not found
		const isEligible =
			isCastOwner ||
			(await checkEligibility({
				castObj: castObject,
				viewerFid,
			}));
		if (keccak256Hash && isEligible) {
			// Use provided { secret, salt, shift }, or fallback to ctx.env values
			const effectiveSecret = secret || env.SECRET;
			const effectiveSalt = salt || env.SALT;

			const saltedHashedFid = await hash(castObject.author.fid.toString(), effectiveSalt);
			const obscuredEncodedText = await hash(keccak256Hash, effectiveSalt);

			// get the cast from the database
			const sqlStatement = `
                SELECT
                    encrypted_message
                FROM stored_data 
                WHERE salted_hashed_fid = '${saltedHashedFid}'
                    AND obscured_hashed_text = '${obscuredEncodedText}'
                    AND schema_version = '${SCHEMA}'
            `;
			const stmt = env.D1.prepare(sqlStatement);
			const result = await stmt.first<{ encrypted_message: string }>();

			if (!result) {
				return undefined;
			}

			// decrypt and return the cast
			const encryptedMessage = JSON.parse(result.encrypted_message) as EncryptedPacket;
			const decryptedMessage = await decrypt(encryptedMessage, effectiveSecret);
			const messageObj = JSON.parse(decryptedMessage) as ExternalData;
			return {
				castHash,
				isDecrypted: true,
				fid: castObject.author.fid,
				timestamp: castObject.timestamp,
				text: messageObj.text ? castObject.text.replace(keccak256Hash, messageObj.text) : castObject.text,
			};
		}

		return {
			castHash,
			isDecrypted: false,
			fid: castObject.author.fid,
			timestamp: castObject.timestamp,
			text: castObject.text,
		};
	},
};
