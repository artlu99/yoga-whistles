import { fetcher } from 'itty-fetcher';
import { CastObject } from './neynar-types';
import { Env } from '../types';

const endpoint = 'https://api.neynar.com/v2/farcaster';

export const getCastByHash = async (hash: string, env: Env) => {
	const res = await fetcher({
		base: endpoint,
		headers: { 'x-api-key': env.NEYNAR_API_KEY },
	}).get<{ cast: CastObject }>(`/cast?identifier=${hash}&type=hash`);

	if (!res.cast.hash) {
		console.error(endpoint, JSON.stringify(res));
		throw new Error('Failed to fetch data');
	}
	return res.cast;
};
