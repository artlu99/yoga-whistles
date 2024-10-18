import { describe, expect, it } from 'vitest';
import { getChannelMembers } from '../src/lib/warpcast';

describe('warpcast api', () => {
	it('arthur channel members', async () => {
		const channelId = 'arthur';
		const members = await getChannelMembers(channelId);
		expect(members.length).toBe(25);
	});

	it('bcbhshow channel members', async () => {
		const channelId = 'bcbhshow';
		const members = await getChannelMembers(channelId);
		expect(members.length).toBe(16);
	});
});
