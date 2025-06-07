import { fetcher } from "itty-fetcher";

const endpoint = "https://shim.artlu.xyz";

export interface CastObject {
	fid: number;
	hash: `0x${string}`;
	text: string | null;
	timestamp: number;
	channel?: { id: string };
}

export const getCastByHash = async (fid: number, hash: string) => {
	const res = await fetcher({
		base: endpoint,
	}).get<{ cast: CastObject }>(`/i/${fid}/${hash}`);

	if (!res.cast.hash) {
		console.error(endpoint, JSON.stringify(res));
		throw new Error("Failed to fetch data");
	}
	return res.cast;
};
