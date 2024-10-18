import { describe, expect, it } from 'vitest';
import { ExternalData } from '../src/types';
import { decrypt, encrypt } from './../src/lib/aes-gcm';
import { prepareExternalDataForStorage } from './../src/utils/e2e';

// random key generator microservice https://worker-rough-glade-7880.artlu.workers.dev
const secret = 'lei8p2rIzx2IW5MJjaAiJTu_7J8QoxZ6ivKlvZXsnGk';
const secret2 = 'WSYvMsT1JvofA1RBlf0QAqn_zPJGYpMdJTFr0eQNnAQ';
const plainText1 = 'Hello, world!';
const plainText2 = 'Goodbye, cruel world';

describe('encrypt/decrypt', () => {
	it('happy path', async () => {
		const encryptedPacketAsString = await encrypt(plainText1, secret);
		const encryptedPacket = JSON.parse(encryptedPacketAsString);

		const decryptedText = await decrypt(encryptedPacket, secret);
		expect(decryptedText).toBe(plainText1);
	});

	it('different plainText', async () => {
		const encryptedPacketAsString = await encrypt(plainText2, secret);
		const encryptedPacket = JSON.parse(encryptedPacketAsString);

		const decryptedText = await decrypt(encryptedPacket, secret);
		expect(decryptedText).toBe(plainText2);
	});

	it('same plainText with second secret', async () => {
		const encryptedPacketAsString = await encrypt(plainText1, secret2);
		const encryptedPacket = JSON.parse(encryptedPacketAsString);

		const decryptedText = await decrypt(encryptedPacket, secret2);
		expect(decryptedText).toBe(plainText1);
	});

	it('wrong secret', async () => {
		const encryptedPacketAsString = await encrypt(plainText1, secret);
		const encryptedPacket = JSON.parse(encryptedPacketAsString);

		await expect(decrypt(encryptedPacket, secret2)).rejects.toThrow('Decryption failed');
	});
});

describe('updateData mutation logic', () => {
	it('happy path', async () => {
		const dataToStore = await prepareExternalDataForStorage({
			externalData: {
				fid: 1,
				timestamp: '1679481600000',
				messageHash: '0x1234567890abcdef',
				text: plainText1,
			},
			secret: secret,
			shift: 500000,
			salt: 'salt',
		});

		expect(dataToStore).toBeTruthy();

		if (!dataToStore) {
			return;
		}

		expect(dataToStore.saltedHashedFid).toEqual('64bde76b7a6c3fd19f44e243a2e00147f963876319a4126cd89c6b7473f5b457');
		expect(dataToStore.shiftedTimestamp).toEqual('1679481100000');
		expect(dataToStore.obscuredMessageHash).toEqual('1155d719e6ddf13561d70eaeaed3af1c453978917021e47631523a585e210fbe');

		const encryptedPacket = JSON.parse(dataToStore.encryptedMessage);
		const decryptedMessage = await decrypt(encryptedPacket, secret);
		const messageObj = JSON.parse(decryptedMessage) as ExternalData;

		expect(messageObj.text).toEqual(plainText1);
	});
});
