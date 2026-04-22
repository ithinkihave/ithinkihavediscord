import type { DiscordMessage } from "../../lib/messageTypes.ts";

export type MockMessageOptions = {
	content?: string;
	channelId?: string;
	channelName?: string;
	attachments?: Array<{ url: string; contentType?: string | null }>;
	embeds?: Array<{
		image?: { url?: string };
		thumbnail?: { url?: string };
		video?: { url?: string };
		url?: string;
	}>;
	onDelete?: () => void | Promise<void>;
	onReact?: (emoji: string) => void | Promise<void>;
	onReply?: (response: string) => void | Promise<void>;
};

export function createMockMessage(
	options: MockMessageOptions = {},
): DiscordMessage {
	const attachmentEntries = (options.attachments ?? []).map(
		(attachment, index) => [String(index), attachment] as const,
	);

	return {
		content: options.content ?? "hello",
		channel: {
			id: options.channelId ?? "test-channel",
			name: options.channelName,
		},
		attachments: new Map(attachmentEntries),
		embeds: options.embeds ?? [],
		stickers: { size: 0 },
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
