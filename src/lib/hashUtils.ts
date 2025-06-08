import {
	arrayBufferToUint8Array,
	uint8ArrayToHexString,
} from "./arrayBufferUtils";

export const hash = async (plain: string, salt: string) => {
	const saltedArray = new TextEncoder().encode(`${salt}+${plain}`);
	const arrayBuf = await crypto.subtle.digest({ name: "SHA-256" }, saltedArray);
	const hash = uint8ArrayToHexString(arrayBufferToUint8Array(arrayBuf));
	return hash;
};
