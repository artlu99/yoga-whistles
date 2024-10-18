import { ASYNC_VALID_BEARER_TOKENS, ASYNC_VALID_TOKENS } from './secrets';

export const verifyToken = (token: string | undefined): Promise<boolean> => {
	return new Promise((resolve, reject) => {
		return token && ASYNC_VALID_TOKENS.includes(token) ? resolve(true) : reject(false);
	});
};

export const isValidAuthHeader = async (headers: Headers) => {
	const authorization = headers.get('Authorization');
	if (!authorization) return false;

	const token = authorization.split(' ')[1]; // Extract token from "Bearer <token>"
	if (!token) return false;

	return await verifyToken(token);
};

export const hasClientToken = async (headers: Headers) => {
	const authorization = headers.get('Authorization');
	if (!authorization) return false;

	const token = authorization.split(' ')[1]; // Extract token from "Bearer <token>"
	if (!token) return false;

	return ASYNC_VALID_BEARER_TOKENS.includes(token);
};
