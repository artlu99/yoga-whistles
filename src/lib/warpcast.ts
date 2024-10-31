import { fetcher } from 'itty-fetcher';
const WARPCAST_API_BASE_URL = 'https://api.warpcast.com';
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
export interface Channel {
	id: string;
	url: string;
	name: string;
	description: string;
	descriptionMentions: number[];
	descriptionMentionsPositions: number[];
	imageUrl?: string;
	headerImageUrl?: string;
	leadFid: number;
	moderatorFids: number[];
	createdAt: number;
	followerCount: number;
	memberCount: number;
	pinnedCastHash?: string;
	publicCasting: boolean;
	externalLink?: {
		title: string;
		url: string;
	};
}
interface ChannelWarpcastApiResponse {
	result: { channel: Channel };
}

export const getChannelMembers = async (channelId: string) => {
	const res = await fetcher({ base: WARPCAST_API_URL }).get<ChannelMembersWarpcastApiResponse>(`?channelId=${channelId}&limit=1000`);

	return res.result.members;
};

export const getChannel = async (channelId: string) => {
	const res = await fetcher({ base: WARPCAST_API_BASE_URL }).get<ChannelWarpcastApiResponse>(`/v1/channel?channelId=${channelId}`);

	return res.result.channel;
};

// https://docs.farcaster.xyz/learn/what-is-farcaster/messages#timestamps
export const FarcasterEpochToUnixEpoch = (timestamp: string) => {
	return Number(timestamp) + Number(1609459200);
};
