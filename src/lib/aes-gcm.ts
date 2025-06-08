import type { EncryptedPacket } from "../types";
import {
	arrayBufferToUint8Array,
	decodeUint8Array,
	encodeUint8Array,
} from "./arrayBufferUtils";

const importKey = async (secret: string): Promise<CryptoKey> => {
	const key = await crypto.subtle.importKey(
		"jwk",
		{
			kty: "oct",
			key_ops: ["encrypt", "decrypt"],
			alg: "A256GCM",
			ext: true,
			k: secret,
		},
		"AES-GCM",
		true,
		["encrypt", "decrypt"],
	);
	return key;
};

export const decrypt = async (
	packet: EncryptedPacket,
	secret: string,
): Promise<string> => {
	const { i, e: encryptedText } = packet;

	const iv = decodeUint8Array(i);
	const key = await importKey(secret);
	const cipherText = decodeUint8Array(encryptedText);
	const arrayBuf = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv },
		key,
		cipherText,
	);

	const dec = new TextDecoder();
	const decryptedText = dec.decode(arrayBuf);

	return decryptedText;
};

export const encrypt = async (
	plainText: string,
	secret: string,
): Promise<string> => {
	const enc = new TextEncoder();
	const encoded = enc.encode(plainText);

	const iv = crypto.getRandomValues(new Uint8Array(12));
	const key = await importKey(secret);
	const arrayBuf = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv: iv },
		key,
		encoded,
	);
	const cipherText = arrayBufferToUint8Array(arrayBuf);

	const packet: EncryptedPacket = {
		i: encodeUint8Array(iv),
		e: encodeUint8Array(cipherText),
	};

	return JSON.stringify(packet);
};
