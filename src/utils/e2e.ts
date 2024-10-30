import { Validator } from '@cfworker/json-schema';
import { encrypt } from '../lib/aes-gcm';
import { ExternalData, ExternalDataSchema, StoredData } from '../types';
import { hash } from './../lib/hashUtils';

export const generatePartitionId = async (secret: string, salt: string, shift: number) =>
	await hash([secret, salt, shift.toString()].join(':'), 'unsalted');

export const prepareExternalDataForStorage = async (props: {
	externalData: ExternalData;
	secret: string;
	shift: number;
	salt: string;
}): Promise<StoredData | undefined> => {
	const { externalData, secret, shift, salt } = props;

	const validator = new Validator(ExternalDataSchema);
	const res = validator.validate(externalData);
	if (!res.valid) {
		console.error('Invalid externalData:', res.errors);
	}

	const { fid, timestamp, messageHash, text, hashedText } = externalData;
	if (!fid || !timestamp || !messageHash) {
		return undefined;
	}
	if (!text) {
		return undefined;
	}

	const saltedHashedFid = await hash(fid.toString(), salt);
	const shiftedTimestamp = (BigInt(timestamp) - BigInt(shift)).toString();
	const obscuredMessageHash = await hash(messageHash, salt);
	const encryptedMessage = await encrypt(JSON.stringify({ messageHash, fid, timestamp, text }), secret);
	const obscuredHashedText = hashedText ? await hash(hashedText, salt) : '';
	const partitionId = await generatePartitionId(secret, salt, shift);

	return {
		saltedHashedFid,
		shiftedTimestamp,
		obscuredMessageHash,
		encryptedMessage,
		obscuredHashedText,
		partitionId,
	};
};
