import type { Schema } from '@cfworker/json-schema';
import type { YogaInitialContext } from 'graphql-yoga';

export interface Env {
	SECRET: string;
	SALT: string;
	SHIFT: number;
	TURSO_DATABASE_URL: string;
	TURSO_AUTH_TOKEN: string;
}

export interface CFContext extends YogaInitialContext {
	env: Env;
	request: Request;
}

export const PacketSchema: Schema = {
	type: 'object',
	optional: ['e', 'i', 'p', 'z'],
	properties: {
		e: { type: 'string' },
		i: { type: 'string' },
		p: { type: 'string' },
		z: { type: 'string' },
	},
};
export interface Packet {
	e?: string; // encryptedText
	i?: string; // iv
	p?: string; // plainText
	z?: string; // zkp
}

export interface EncryptedPacket {
	e: string; // encryptedText
	i: string; // iv
	p?: string; // plainText
	z?: string; // zkp
}

export const ExternalDataSchema: Schema = {
	type: 'object',
	required: ['fid', 'timestamp', 'messageHash'],
	optional: ['text', 'hashedText'],
	properties: {
		fid: { type: 'number' },
		timestamp: { type: 'string' },
		messageHash: { type: 'string' },
		text: { type: 'string' },
		hashedText: { type: 'string' },
	},
};
export interface ExternalData {
	fid: number;
	timestamp: string;
	messageHash: string;
	text?: string;
	hashedText?: string;
}

export const StoredDataSchema: Schema = {
	type: 'object',
	required: ['obscuredMessageHash', 'saltedHashedFid', 'shiftedTimestamp', 'encryptedMessageHash', 'encryptedText', 'obscuredHashedText'],
	properties: {
		obscuredMessageHash: { type: 'string' },
		saltedHashedFid: { type: 'string' },
		shiftedTimestamp: { type: 'number' },
		encryptedMessage: { type: 'string' },
		obscuredHashedText: { type: 'string' },
		partitionId: { type: 'string' },
	},
};
export interface StoredData {
	obscuredMessageHash: string;
	saltedHashedFid: string;
	shiftedTimestamp: string;
	encryptedMessage: string;
	obscuredHashedText: string;
	partitionId: string;
}
