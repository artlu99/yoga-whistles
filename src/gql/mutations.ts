import { ALLOW_ANON_FIDS, SCHEMA } from '../constants';
import { hasClientToken, isValidAuthHeader } from '../helpers';
import { disableChannel, enableChannel, invalidateNonce, isValidNonce } from '../lib/redis';
import { tursoClient } from '../lib/turso';
import { CFContext } from '../types';
import { calcPruneBoundary, generatePartitionId, prepareExternalDataForStorage } from '../utils/e2e';
import { AuthorizedPlaintextMessage, DisableChannelInput, EnableChannelInput, MessagesToMarkForPruning } from './types';

const checkToken = async (request: Request<unknown, CfProperties<unknown>>): Promise<void> => {
	const isTokenValid = await isValidAuthHeader(request?.headers);
	if (!isTokenValid) {
		throw new Error('Invalid or expired token');
	}
};

const checkNonce = async (nonce: string | undefined): Promise<void> => {
	const nonceValidFlag = await isValidNonce(nonce);
	if (!nonceValidFlag) {
		throw new Error('Invalid or expired nonce: ' + nonce);
	} else if (nonceValidFlag) {
		if (!ALLOW_ANON_FIDS) {
			await invalidateNonce(nonce);
		}
	}
};

export const Mutation = {
	updateData: async (_: any, { input }: { input: AuthorizedPlaintextMessage }, { env, request }: CFContext) => {
		await checkToken(request);
		await checkNonce(input.nonce);

		const { fid, timestamp, messageHash, text, hashedText, secret, salt, shift } = input;
		const effectiveSecret = secret ?? env.SECRET;
		const effectiveSalt = salt ?? env.SALT;
		const effectiveShift = shift ?? env.SHIFT;
		if (!fid || !timestamp || !messageHash || !text || !hashedText) {
			throw new Error('Missing required fields');
		}

		const dataToStore = await prepareExternalDataForStorage({
			externalData: { fid, timestamp, messageHash, text, hashedText },
			secret: effectiveSecret,
			shift: effectiveShift,
			salt: effectiveSalt,
		});

		if (!dataToStore) {
			throw new Error('Data not prepared');
		}

		const sqlStatement = `INSERT INTO stored_data
        (obscured_message_id, salted_hashed_fid, shifted_timestamp, encrypted_message, obscured_hashed_text, partition_id, schema_version)
         VALUES ((:obscuredMessageHash), (:saltedHashedFid), (:shiftedTimestamp), (:encryptedMessage), (:obscuredHashedText), (:partitionId), '${SCHEMA}')
          ON CONFLICT (partition_id, schema_version, obscured_message_id)
           DO UPDATE
            SET salted_hashed_fid = (:saltedHashedFid),
                shifted_timestamp = (:shiftedTimestamp),
                encrypted_message = (:encryptedMessage),
                obscured_hashed_text = (:obscuredHashedText),
				partition_id = (:partitionId)`;

		try {
			await tursoClient(env).execute({
				sql: sqlStatement,
				args: {
					obscuredMessageHash: dataToStore.obscuredMessageHash,
					saltedHashedFid: dataToStore.saltedHashedFid,
					shiftedTimestamp: dataToStore.shiftedTimestamp,
					encryptedMessage: dataToStore.encryptedMessage,
					obscuredHashedText: dataToStore.obscuredHashedText,
					partitionId: dataToStore.partitionId,
				},
			});
		} catch (e) {
			console.error(e);
			throw new Error('Update failed');
		}

		return { success: true, message: 'Data updated successfully' };
	},
	markMessagesForPruning: async (_: any, { input }: { input: MessagesToMarkForPruning }, { env, request }: CFContext) => {
		const { secret, salt, shift } = input;
		const effectiveSecret = secret ?? env.SECRET;
		const effectiveSalt = salt ?? env.SALT;
		const effectiveShift = shift ?? env.SHIFT;

		const partitionId = await generatePartitionId(effectiveSecret, effectiveSalt, effectiveShift);
		const pruneBoundary = calcPruneBoundary(effectiveShift);

		const sqlStatement = `
            UPDATE stored_data
            SET deleted_at = CURRENT_TIMESTAMP
            WHERE partition_id = (:partitionId)
				AND deleted_at IS NULL
                AND shifted_timestamp < (:pruneBoundary)
                AND schema_version = '${SCHEMA}'
        `;

		try {
			console.log(sqlStatement, partitionId, pruneBoundary);
			const rs = await tursoClient(env).execute({ sql: sqlStatement, args: { partitionId, pruneBoundary } });
			console.log(rs);
			const cnt = rs.rowsAffected;

			return {
				success: cnt,
				message: `${cnt} messages successfully marked for pruning`,
			};
		} catch (e) {
			console.error(e);
			throw new Error('Update failed');
		}
	},
	enableChannel: async (_: any, { input }: { input: EnableChannelInput }, { env, request }: CFContext) => {
		await hasClientToken(request.headers);

		const { channelId, parentUrl } = input;
		if (!channelId || !parentUrl) {
			throw new Error('Missing required fields');
		}

		await enableChannel(channelId, parentUrl);

		return { success: true, message: 'Channel enabled successfully' };
	},
	disableChannel: async (_: any, { input }: { input: DisableChannelInput }, { env, request }: CFContext) => {
		await hasClientToken(request.headers);

		const { channelId } = input;
		if (!channelId) {
			throw new Error('Missing required fields');
		}

		await disableChannel(channelId);
		return { success: true, message: 'Channel disabled successfully' };
	},
};
