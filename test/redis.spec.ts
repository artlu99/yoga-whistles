import { describe, expect, it } from 'vitest';
import { getChannelMembersSwr, listEnabledChannels } from '../src/lib/redis';

describe('redis cache', () => {
	it('known channels', async () => {
		const knownChannels = await listEnabledChannels();
		expect(knownChannels.length).toBe(13);
	});
	it('arthur channel members', async () => {
		const channelId = 'arthur';
		const members = await getChannelMembersSwr(channelId);
		expect(members.length).toBe(51);
	});

	it('bcbhshow channel members', async () => {
		const channelId = 'bcbhshow';
		const members = await getChannelMembersSwr(channelId);
		expect(members.length).toBe(16);
	});

	it('no-channel channel members', async () => {
		const channelId = 'no-channel';
		const members = await getChannelMembersSwr(channelId);
		expect(members.length).toBe(1728);
	});
});
