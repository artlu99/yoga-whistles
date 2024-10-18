import { fetcher } from 'itty-fetcher';
import { CastObject } from './neynar-types';
import { Env } from '../types';

const endpoint = 'https://api.pinata.cloud/v3/farcaster/casts/';

export const getCastByHash = async (hash: string, env: Env) => {
	const res = await fetcher({
		base: endpoint,
		headers: { Authorization: `Bearer ${env.PINATA_JWT}` },
	}).get<{ cast: CastObject }>(hash);

	if (!res.cast.hash) {
		console.error(endpoint, JSON.stringify(res));
		throw new Error('Failed to fetch data');
	}
	return res.cast;
};
