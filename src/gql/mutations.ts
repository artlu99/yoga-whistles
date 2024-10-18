import { SCHEMA } from '../constants';
import { isValidAuthHeader } from '../helpers';
import { enableChannel, invalidateNonce, isValidNonce } from '../lib/redis';
import { CFContext } from '../types';
import { prepareExternalDataForStorage } from '../utils/e2e';
import { AuthorizedPlaintextMessage, EnableChannelInput } from './types';

export const Mutation = {
	updateData: async (_: any, { input }: { input: AuthorizedPlaintextMessage }, { env, request }: CFContext) => {
		const isTokenValid = await isValidAuthHeader(request?.headers);
		if (!isTokenValid) {
			throw new Error('Invalid or expired token');
		}

		const { fid, timestamp, messageHash, text, hashedText, nonce } = input;

		if (!fid || !timestamp || !messageHash || !text || !hashedText) {
			throw new Error('Missing required fields');
		}

		const nonceValidFlag = await isValidNonce(nonce);
		if (!nonceValidFlag) {
			throw new Error('Invalid or expired nonce: ' + nonce);
		} else if (nonceValidFlag) {
			await invalidateNonce(nonce);
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
        (obscured_message_id, salted_hashed_fid, shifted_timestamp, encrypted_message, obscured_hashed_text, schema_version) 
         VALUES ($1, $2, $3, $4, $5, '${SCHEMA}')
          ON CONFLICT (schema_version, obscured_message_id)
           DO UPDATE
            SET salted_hashed_fid = $2,
                shifted_timestamp = $3,
                encrypted_message = $4,
                obscured_hashed_text = $5`;

		try {
			const stmt = env.D1.prepare(sqlStatement).bind(
				dataToStore.obscuredMessageHash,
				dataToStore.saltedHashedFid,
				dataToStore.shiftedTimestamp,
				dataToStore.encryptedMessage,
				dataToStore.obscuredHashedText
			);
			await stmt.run();
		} catch (e) {
			console.error(e);
			throw new Error('Update failed');
		}

		return { success: true, message: 'Data updated successfully' };
	},
	enableChannel: async (_: any, { input }: { input: EnableChannelInput }, { env, request }: CFContext) => {
		const isTokenValid = await isValidAuthHeader(request?.headers);
		if (!isTokenValid) {
			throw new Error('Invalid or expired token');
		}

		const { channelId, parentUrl, nonce } = input;

		if (!channelId || !parentUrl) {
			throw new Error('Missing required fields');
		}

		const nonceValidFlag = await isValidNonce(nonce);
		if (!nonceValidFlag) {
			throw new Error('Invalid or expired nonce: ' + nonce);
		} else if (nonceValidFlag) {
			await invalidateNonce(nonce);
		}

		await enableChannel(channelId, parentUrl);

		return { success: true, message: 'Channel enabled successfully' };
	},
};
