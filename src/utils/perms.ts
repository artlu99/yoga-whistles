import { LOOKBACK_WINDOW, PRUNE_INTERVAL } from '../constants';
import { CastObject } from '../lib/neynar-types';
import { getChannelMembersSwr, listEnabledChannels, markFidForPruning } from '../lib/redis';

export const checkEligibility = async (props: { castObj: CastObject; viewerFid: number }): Promise<boolean> => {
	const { castObj, viewerFid } = props;
	const channelId = castObj.channel?.id;
	const timestamp = new Date(castObj.timestamp).getTime();

	// cast is older than 60 days
	if (timestamp < Date.now() - PRUNE_INTERVAL * 24 * 60 * 60 * 1000) {
		console.error('cast is older than PRUNE_INTERVAL');
		await markFidForPruning(castObj.author.fid);
		return false;
	}

	if (channelId) {
		// check if the channel has been opted in by the channel owner
		const enabledChannels = await listEnabledChannels();
		if (!enabledChannels.includes(channelId)) {
			console.error('channel is not enabled');
			return false;
		}
	} else {
		// The Shoni Rule - https://warpcast.com/shoni.eth/0xc9eaf251
		return true; // TODO: more sophisticated logic for non-channel casts
	}

	const members = channelId ? await getChannelMembersSwr(channelId) : [];

	const cutoff = Date.now() - LOOKBACK_WINDOW * 24 * 60 * 60 * 1000;
	if (timestamp < cutoff) {
		return !!members.find((cm) => cm.fid === viewerFid && cm.memberAt < cutoff);
	} else {
		return !!members.find((cm) => cm.fid === viewerFid);
	}
};
