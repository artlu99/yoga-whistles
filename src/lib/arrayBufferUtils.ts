import { Buffer } from "node:buffer";

export const encodeUint8Array = (u8: Uint8Array) =>
	Buffer.from(u8).toString("base64");
export const decodeUint8Array = (str: string) =>
	new Uint8Array(Buffer.from(str, "base64"));
export const arrayBufferToUint8Array = (arrayBuf: ArrayBuffer) =>
	new Uint8Array(arrayBuf);
export const uint8ArrayToHexString = (uint8Array: Uint8Array) =>
	[...uint8Array].map((b) => b.toString(16).padStart(2, "0")).join("");
