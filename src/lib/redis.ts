import { Redis } from "@upstash/redis/cloudflare";
import { UPSTASH_REDIS_REST_TOKEN, UPSTASH_REDIS_REST_URL } from "../secrets";
import {
	type Channel,
	type ChannelMember,
	getChannel as getWarpcastChannel,
	getChannelMembers as getWarpcastChannelMembers,
} from "./warpcast";

const redis = new Redis({
	url: UPSTASH_REDIS_REST_URL,
	token: UPSTASH_REDIS_REST_TOKEN,
});

export const enableChannel = async (channelId: string, channelUrl: string) => {
	await redis.hset("channels", { [channelId]: channelUrl });
	await redis.hdel("opted-out-channels", channelId);
};

export const disableChannel = async (channelId: string) => {
	await redis.hdel("channels", channelId);
	await redis.hset("opted-out-channels", { [channelId]: "true" });
};

export const listEnabledChannels = async () => {
	const res = await redis.hkeys("channels");
	return res;
};

export const listOptedOutChannels = async () => {
	const res = await redis.hkeys("opted-out-channels");
	return res;
};

export const getChannelUrl = async (channelId: string) => {
	const res = await redis.hget("channels", channelId);
	return res;
};

export const getChannelMembersSwr = async (channelId: string) => {
	const res = (await redis.smembers(`members-${channelId}`)) as ChannelMember[];

	try {
		const channelMembers = (await getWarpcastChannelMembers(channelId)) ?? [];
		await redis.del(`members-${channelId}`);
		await redis.sadd(
			`members-${channelId}`,
			channelMembers[0],
			...channelMembers.slice(1),
		);
	} catch (e) {
		console.error("error while updating channel members:", e);
	}

	return res;
};

export const getChannelSwr = async (channelId: string) => {
	const res = (await redis.hget("channel", channelId)) as Channel;

	try {
		const channel = await getWarpcastChannel(channelId);
		await redis.hset("channel", { [channelId]: channel });
	} catch (e) {
		console.error("error while updating channel:", e);
	}

	return res;
};
