import { fetcher } from 'itty-fetcher';
const WARPCAST_API_URL = 'https://api.warpcast.com/fc/channel-members' ?? 'https://channel-members.artlu.workers.dev/';

export interface ChannelMember {
	fid: number;
	memberAt: number;
}
interface ChannelMembersWarpcastApiResponse {
	result: {
		members: ChannelMember[];
	};
	next?: { cursor: string };
}

export const getChannelMembers = async (channelId: string) => {
	const res = await fetcher({ base: WARPCAST_API_URL }).get<ChannelMembersWarpcastApiResponse>(`?channelId=${channelId}&limit=1000`);

	return res.result.members;
};

// https://docs.farcaster.xyz/learn/what-is-farcaster/messages#timestamps
export const FarcasterEpochToUnixEpoch = (timestamp: string) => {
	return Number(timestamp) + Number(1609459200);
};
