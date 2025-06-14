import {
	ALLOW_FREE_RANGE_SASSY,
	LOOKBACK_WINDOW,
	PRUNE_INTERVAL,
} from "../constants";
import {
	getChannelMembersSwr,
	getChannelSwr,
	listEnabledChannels,
	listOptedOutChannels,
} from "../lib/redis";
import type { CastObject } from "../lib/shim";

export const checkEligibility = async (props: {
	castObj: CastObject;
	viewerFid: number;
}): Promise<boolean> => {
	const { castObj, viewerFid } = props;
	const channelId = castObj.channel?.id;
	const timestamp = new Date(castObj.timestamp * 1000).getTime();

	// cast is older than 60 days
	if (timestamp < Date.now() - PRUNE_INTERVAL * 24 * 60 * 60 * 1000) {
		console.error("cast is older than PRUNE_INTERVAL");
		return false;
	}

	if (channelId) {
		// The KMac Rule - https://warpcast.com/kmacb.eth/0x3aad1d27
		// check if the channel owner has specified publicCasting: true
		const channel = await getChannelSwr(channelId);
		if (channel?.publicCasting) {
			return true;
		}

		// check if the channel has been opted out by the channel owner
		const optedOutChannels = await listOptedOutChannels();
		if (optedOutChannels.includes(channelId)) {
			console.error("channel owner has opted out");
			return false;
		}

		// check if the channel has been opted in by the channel owner
		if (!ALLOW_FREE_RANGE_SASSY) {
			const enabledChannels = await listEnabledChannels();
			if (!enabledChannels.includes(channelId)) {
				console.error("channel is not enabled");
				return false;
			}
		}
	} else {
		// The Shoni Rule - https://warpcast.com/shoni.eth/0xc9eaf251
		return true; // TODO: more sophisticated logic for non-channel casts
	}

	const members = channelId ? await getChannelMembersSwr(channelId) : [];

	const cutoff = Date.now() - LOOKBACK_WINDOW * 24 * 60 * 60 * 1000;
	if (timestamp < cutoff) {
		return !!members.find((cm) => cm.fid === viewerFid && cm.memberAt < cutoff);
	}
	return !!members.find((cm) => cm.fid === viewerFid);
};
