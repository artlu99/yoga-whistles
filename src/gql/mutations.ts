import { ALLOW_ANON_FIDS, SCHEMA } from '../constants';
import { hasClientToken, isValidAuthHeader } from '../helpers';
import { disableChannel, enableChannel, invalidateNonce, isValidNonce } from '../lib/redis';
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

		const { fid, timestamp, messageHash, text, hashedText } = input;
		if (!fid || !timestamp || !messageHash || !text || !hashedText) {
			throw new Error('Missing required fields');
		}

		const dataToStore = await prepareExternalDataForStorage({
			externalData: { fid, timestamp, messageHash, text, hashedText },
			secret: env.SECRET,
			shift: env.SHIFT,
			salt: env.SALT,
		});

		if (!dataToStore) {
			throw new Error('Data not prepared');
		}

		const sqlStatement = `INSERT INTO stored_data 
        (obscured_message_id, salted_hashed_fid, shifted_timestamp, encrypted_message, obscured_hashed_text, partition_id, schema_version) 
         VALUES ($1, $2, $3, $4, $5, $6, '${SCHEMA}')
          ON CONFLICT (partition_id, schema_version, obscured_message_id)
           DO UPDATE
            SET salted_hashed_fid = $2,
                shifted_timestamp = $3,
                encrypted_message = $4,
                obscured_hashed_text = $5,
				partition_id = $6`;

		try {
			const stmt = env.D1.prepare(sqlStatement).bind(
				dataToStore.obscuredMessageHash,
				dataToStore.saltedHashedFid,
				dataToStore.shiftedTimestamp,
				dataToStore.encryptedMessage,
				dataToStore.obscuredHashedText,
				dataToStore.partitionId
			);
			await stmt.run();
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
            WHERE partition_id = $1
				AND deleted_at IS NULL
                AND shifted_timestamp < $2
                AND schema_version = '${SCHEMA}'
        `;

		try {
			const stmt = env.D1.prepare(sqlStatement).bind(partitionId, pruneBoundary);
			const cnt = await stmt.run();

			return {
				success: cnt.meta.changed_db,
				message: `${cnt.meta.changes} messages successfully marked for pruning`,
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
