export interface AuthorizedPlaintextMessage {
	fid: number;
	timestamp: string;
	messageHash: string;
	text: string;
	hashedText: string;
	nonce?: string;
}

export interface EnableChannelInput {
	channelId: string;
	parentUrl: string;
}

export interface DisableChannelInput {
	channelId: string;
}

export interface GetDecryptedDataArgs {
	messageId: string;
	bearerToken?: string;
	secret?: string;
	salt?: string;
}

export interface GetDecryptedMessagesByFidArgs {
	fid: number;
	bearerToken?: string;
	limit?: number;
	sortOrder?: { asc: true };
	secret?: string;
	salt?: string;
	shift?: number;
}

export interface GetDecryptedMessageByFidArgs {
	fid: number;
	encodedText: string;
	bearerToken?: string;
	secret?: string;
	salt?: string;
	shift?: number;
}

export interface GetTextByCastHashArgs {
	castHash: string;
	viewerFid: number;
	secret?: string;
	salt?: string;
	shift?: number;
}
