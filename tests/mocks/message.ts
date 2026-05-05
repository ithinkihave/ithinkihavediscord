import type { DiscordMessage } from "../../lib/messageTypes.ts";

export type MockMember = {
	setNickname: (nickname: string) => Promise<void>;
};

export type MockMessageOptions = {
	content?: string;
	channelId?: string;
	onDelete?: () => void | Promise<void>;
	onReact?: (emoji: string) => void | Promise<void>;
	onReply?: (response: string) => void | Promise<void>;
	guildMembers?: Record<string, MockMember>;
};

export function createMockMessage(
	options: MockMessageOptions = {},
): DiscordMessage {
	const guild = options.guildMembers
		? {
				members: {
					fetch: async (userId: string) => {
						const member = options.guildMembers?.[userId];
						if (!member)
							throw new Error(`Member ${userId} not found`);
						return member;
					},
				},
			}
		: null;

	return {
		content: options.content ?? "hello",
		channel: { id: options.channelId ?? "test-channel" },
		guild,
		async delete() {
			await options.onDelete?.();
		},
		async react(emoji: string) {
			await options.onReact?.(emoji);
		},
		async reply(response: string) {
			await options.onReply?.(response);
		},
	} as unknown as DiscordMessage;
}
