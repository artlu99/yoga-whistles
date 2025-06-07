import { Validator } from '@cfworker/json-schema';
import { LOOKBACK_WINDOW, PRUNE_INTERVAL, SCHEMA } from '../constants';
import { hasClientToken, isValidAuthHeader, verifyToken } from '../helpers';
import { decrypt } from '../lib/aes-gcm';
import { hash } from '../lib/hashUtils';
import { getCastByHash } from '../lib/hub';
import { listEnabledChannels, listOptedOutChannels } from '../lib/redis';
import { tursoClient } from '../lib/turso';
import { FarcasterEpochToUnixEpoch } from '../lib/warpcast';
import { CFContext, EncryptedPacket, ExternalData, ExternalDataSchema } from '../types';
import { generatePartitionId } from '../utils/e2e';
import { checkEligibility } from '../utils/perms';
import { GetDecryptedDataArgs, GetDecryptedMessageByFidArgs, GetDecryptedMessagesByFidArgs, GetTextByCastHashArgs } from './types';

export const Query = {
	heartbeat: () => true,

	lookbackWindow: () => LOOKBACK_WINDOW,
	pruneInterval: () => PRUNE_INTERVAL,

	numMessages: async (_: any, _args: any, { env }: CFContext) => {
		try {
			const sqlStatement = `
				SELECT COUNT(1) AS cnt
				FROM stored_data
				WHERE deleted_at IS NULL
			`;
			const rs = await tursoClient(env).execute(sqlStatement);
			const result = rs.rows.length > 0 ? rs.rows[0] : null;

			if (!result) {
				throw new Error('Data not found');
			}

			return result.cnt;
		} catch (error) {
			console.error('Error in numMessages:', error);
			throw new Error('Failed to get numMessages');
		}
	},
	numMessagesMarkedForPruning: async (_: any, _args: any, { env }: CFContext) => {
		try {
			const sqlStatement = `
				SELECT COUNT(1) AS cnt
				FROM stored_data
				WHERE deleted_at IS NOT NULL
			`;
			const rs = await tursoClient(env).execute(sqlStatement);
			const result = rs.rows.length > 0 ? rs.rows[0] : null;

			if (!result) {
				throw new Error('Data not found');
			}

			return result.cnt;
		} catch (error) {
			console.error('Error in numMessagesMarkedForPruning:', error);
			throw new Error('Failed to get numMessagesMarkedForPruning');
		}
	},
	numFids: async (_: any, _args: any, { env }: CFContext) => {
		try {
			const sqlStatement = `
				SELECT salted_hashed_fid, COUNT(1) AS cnt
				FROM stored_data
				WHERE deleted_at IS NULL
				GROUP BY salted_hashed_fid
			`;
			const rs = await tursoClient(env).execute(sqlStatement);
			const results = rs.rows.map((row) => ({
				salted_hashed_fid: row.salted_hashed_fid,
				cnt: row.cnt,
			}));

			if (!results) {
				throw new Error('Data not found');
			}

			return results.length;
		} catch (error) {
			console.error('Error in numFids:', error);
			throw new Error('Failed to get numFids');
		}
	},
	numPartitions: async (_: any, _args: any, { env }: CFContext) => {
		try {
			const sqlStatement = `
				SELECT partition_id, COUNT(1) AS cnt
				FROM stored_data
				WHERE deleted_at IS NULL
				GROUP BY partition_id
			`;
			const rs = await tursoClient(env).execute(sqlStatement);
			const results = rs.rows.map((row) => ({
				partition_id: row.partition_id,
				cnt: row.cnt,
			}));

			if (!results) {
				throw new Error('Data not found');
			}

			return results.length;
		} catch (error) {
			console.error('Error in numPartitions:', error);
			throw new Error('Failed to get numPartitions');
		}
	},
	numSchemas: async (_: any, _args: any, { env }: CFContext) => {
		try {
			const sqlStatement = `
				SELECT schema_version, COUNT(1) AS cnt
				FROM stored_data
				WHERE deleted_at IS NULL
				GROUP BY schema_version
			`;
			const rs = await tursoClient(env).execute(sqlStatement);
			const results = rs.rows.map((row) => ({
				schema_version: row.schema_version,
				cnt: row.cnt,
			}));

			if (!results) {
				throw new Error('Data not found');
			}

			return results.length;
		} catch (error) {
			console.error('Error in numSchemas:', error);
			throw new Error('Failed to get numSchemas');
		}
	},
	maxSchemaVersion: async (_: any, _args: any, { env }: CFContext) => {
		try {
			const sqlStatement = `
				SELECT schema_version
				FROM stored_data
				WHERE deleted_at IS NULL
				ORDER BY schema_version DESC
				LIMIT 1
			`;
			const rs = await tursoClient(env).execute(sqlStatement);
			const result = rs.rows.length > 0 ? rs.rows[0] : null;

			if (!result) {
				throw new Error('Data not found');
			}

			return result.schema_version;
		} catch (error) {
			console.error('Error in maxSchemaVersion:', error);
			throw new Error('Failed to get maxSchemaVersion');
		}
	},

	isPrePermissionless: (_: any, { fid }: { fid: number }) => {
		return fid === undefined ? false : fid < 20939;
	},
	getTimestampOfEarliestMessage: async (
		_: any,
		{ secret, salt, shift }: { secret: string; salt: string; shift: number },
		{ env }: CFContext
	) => {
		try {
			// Use provided { secret, salt, shift }, or fallback to ctx.env values
			const effectiveSecret = secret || env.SECRET;
			const effectiveSalt = salt || env.SALT;
			const effectiveShift = shift || env.SHIFT;

			const partitionId = await generatePartitionId(effectiveSecret, effectiveSalt, effectiveShift);

			// get the cast from the database
			const sqlStatement = `
                SELECT
                    encrypted_message
                FROM stored_data
                WHERE shifted_timestamp > 1
					AND partition_id = '${partitionId}'
					AND deleted_at IS NULL
					AND schema_version = '${SCHEMA}'
				ORDER BY shifted_timestamp ASC
                LIMIT 20
            `;
			const rs = await tursoClient(env).execute(sqlStatement);

			// TODO: check each packet for valid decryption, and return the earliest valid timestamp
			// this will only become necessary when we have multiple shifts in the db
			const result = rs.rows.length > 0 ? rs.rows[0] : null;

			if (!result) {
				return undefined;
			}

			// decrypt and return the cast
			const encryptedMessage = JSON.parse(result.encrypted_message as string) as EncryptedPacket;
			const decryptedMessage = await decrypt(encryptedMessage, effectiveSecret);
			const messageObj = JSON.parse(decryptedMessage) as ExternalData;

			return FarcasterEpochToUnixEpoch(messageObj.timestamp);
		} catch (error) {
			console.error('Error in getEarliestMessage:', error);
			throw new Error('Failed to retrieve earliest message');
		}
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
	getDisabledChannels: async () => {
		try {
			const res = await listOptedOutChannels();
			return res;
		} catch (error) {
			console.error('Error in getDisabledChannels:', error);
			throw new Error('Failed to retrieve disabled channels');
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
                    obscured_hashed_text,
					partition_id
                FROM stored_data
                WHERE deleted_at IS NULL AND schema_version = '${SCHEMA}'
                ORDER BY ROWID DESC
                LIMIT ?
            `;

			const rs = await tursoClient(env).execute({ sql: sqlStatement, args: [limit] });
			const results = rs.rows.map((row) => ({
				obscured_message_id: row.obscured_message_id,
				salted_hashed_fid: row.salted_hashed_fid,
				shifted_timestamp: row.shifted_timestamp,
				encrypted_message: row.encrypted_message,
				obscured_hashed_text: row.obscured_hashed_text,
				partition_id: row.partition_id,
			}));
			const rows = results.map((row) => {
				return {
					partitionId: row.partition_id,
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
				AND deleted_at IS NULL
                AND schema_version = '${SCHEMA}'
            `;
			const rs = await tursoClient(env).execute({ sql: sqlStatement, args: [obscuredMessageHash] });
			const result = rs.rows.length > 0 ? rs.rows[0] : null;

			if (!result) {
				throw new Error('Data not found');
			}

			// Decrypt the data
			const message = await decrypt(JSON.parse(result.encrypted_message as string) as EncryptedPacket, effectiveSecret);
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
		{ fid, bearerToken, limit = 10, order = { asc: true }, secret, salt, shift }: GetDecryptedMessagesByFidArgs,
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

			const partitionId = await generatePartitionId(effectiveSecret, effectiveSalt, effectiveShift);
			const saltedHashedFid = await hash(fid.toString(), effectiveSalt);

			let sqlStatement = `
                SELECT
                    shifted_timestamp,
                    encrypted_message,
					deleted_at
                FROM stored_data
                WHERE salted_hashed_fid = ?
				AND partition_id = ?
                AND schema_version = '${SCHEMA}'
                ORDER BY shifted_timestamp ${order.asc ? 'ASC' : 'DESC'}
            `;
			const params = [saltedHashedFid, partitionId];

			sqlStatement += ' LIMIT ?';
			params.push((limit + 1).toString()); // Fetch one extra to determine if there are more results

			const rs = await tursoClient(env).execute({ sql: sqlStatement, args: params });
			const results = rs.rows.map((row) => ({
				shifted_timestamp: row.shifted_timestamp,
				encrypted_message: row.encrypted_message,
				deleted_at: row.deleted_at,
			}));

			const messages = [];
			let nextCursor = null;

			for (let i = 0; i < Math.min(results.length, limit); i++) {
				const result = results[i];
				const encryptedMessage = JSON.parse(result.encrypted_message as string) as EncryptedPacket;
				const messageStr = await decrypt(encryptedMessage, effectiveSecret);
				const messageObj = JSON.parse(messageStr);

				messages.push({
					messageHash: messageObj.messageHash,
					fid,
					timestamp: (BigInt(result.shifted_timestamp as string) + BigInt(effectiveShift)).toString(),
					text: messageObj.text,
					deletedAt: result.deleted_at,
				});
			}

			if (results.length > limit) {
				nextCursor = results[limit - 1].shifted_timestamp as string;
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
			const effectiveShift = shift || env.SHIFT;

			const partitionId = await generatePartitionId(effectiveSecret, effectiveSalt, effectiveShift);
			const saltedHashedFid = await hash(fid.toString(), effectiveSalt);
			const obscuredEncodedText = await hash(encodedText, effectiveSalt);

			const sqlStatement = `
                SELECT
                    shifted_timestamp,
                    encrypted_message
                FROM stored_data
                WHERE salted_hashed_fid = (:saltedHashedFid)
                    AND obscured_hashed_text = (:obscuredEncodedText)
					AND deleted_at IS NULL
					AND partition_id = (:partitionId)
                    AND schema_version = '${SCHEMA}'
            `;

			const rs = await tursoClient(env).execute({
				sql: sqlStatement,
				args: { saltedHashedFid, obscuredEncodedText, partitionId },
			});
			const result = rs.rows.length > 0 ? rs.rows[0] : null;

			if (!result) {
				return undefined;
			}

			const encryptedMessage = JSON.parse(result.encrypted_message as string) as EncryptedPacket;
			const messageStr = await decrypt(encryptedMessage, effectiveSecret);
			const messageObj = JSON.parse(messageStr) as ExternalData;

			return messageObj;
		} catch (error) {
			console.error('Error in getDecryptedMessageByFid:', error);
			throw new Error('Failed to retrieve or decrypt messages');
		}
	},
	getTextByCastHash: async (_: any, { castFid, castHash, viewerFid, secret, salt, shift }: GetTextByCastHashArgs, { env, request }: CFContext) => {
		const isFcClient = await hasClientToken(request.headers);
		if (!isFcClient) {
			throw new Error('Invalid or expired token');
		}
		const castObject = await getCastByHash(castFid, castHash, env);
		if (!castObject) {
			throw new Error('Cast not found');
		}

		// if cast has a Keccak256 hash AND viewerFid has access to the cast
		// 		decrypt and return the cast
		// else
		// 	 	return the cast

		const isCastOwner = castObject.author.fid === viewerFid;
		const hasKeccak256HashRe = castObject.text.match(/[a-fA-F0-9]{64}/); // Regular expression to find a Keccak256 hash
		const keccak256Hash = hasKeccak256HashRe ? hasKeccak256HashRe[0] : null; // Extract the hash or set to null if not found
		const isEligible =
			keccak256Hash &&
			(isCastOwner ||
				(await checkEligibility({
					castObj: castObject,
					viewerFid,
				})));
		if (isEligible) {
			// Use provided { secret, salt, shift }, or fallback to ctx.env values
			const effectiveSecret = secret || env.SECRET;
			const effectiveSalt = salt || env.SALT;
			const effectiveShift = shift || env.SHIFT;

			const partitionId = await generatePartitionId(effectiveSecret, effectiveSalt, effectiveShift);
			const saltedHashedFid = await hash(castObject.author.fid.toString(), effectiveSalt);
			const obscuredEncodedText = await hash(keccak256Hash, effectiveSalt);

			// get the cast from the database
			const sqlStatement = `
                SELECT
                    encrypted_message
                FROM stored_data
                WHERE salted_hashed_fid = '${saltedHashedFid}'
                    AND obscured_hashed_text = '${obscuredEncodedText}'
					AND deleted_at IS NULL
					AND partition_id = '${partitionId}'
                    AND schema_version = '${SCHEMA}'
            `;
			const rs = await tursoClient(env).execute(sqlStatement);
			const result = rs.rows.length > 0 ? rs.rows[0] : null;

			if (!result) {
				return undefined;
			}

			// decrypt and return the cast
			const encryptedMessage = JSON.parse(result.encrypted_message as string) as EncryptedPacket;
			const decryptedMessage = await decrypt(encryptedMessage, effectiveSecret);
			const messageObj = JSON.parse(decryptedMessage) as ExternalData;
			return {
				castHash,
				isDecrypted: true,
				fid: castObject.author.fid,
				timestamp: castObject.timestamp,
				decodedText: messageObj.text,
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
