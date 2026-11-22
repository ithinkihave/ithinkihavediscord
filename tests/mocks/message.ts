import type { DiscordMessage } from "../../lib/messageTypes.ts";

export type MockMessageOptions = {
	id?: string;
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
	stickers?: Array<{ url: string; format: number; name?: string }>;
	type?: number;
	author?: { username: string; globalName?: string | null };
	member?: { displayName: string; displayHexColor?: string };
	mentions?: {
		users?: Array<{ id: string; username: string; globalName?: string }>;
		roles?: Array<{ id: string; name: string }>;
		channels?: Array<{ id: string; name: string }>;
	};
	onDelete?: () => void | Promise<void>;
	onReact?: (emoji: string) => void | Promise<void>;
	onReply?: (response: string) => void | Promise<void>;
	onSend?: (payload: unknown) => unknown;
};

export function createMockMessage(
	options: MockMessageOptions = {},
): DiscordMessage {
	const attachmentEntries = (options.attachments ?? []).map(
		(attachment, index) => [String(index), attachment] as const,
	);
	const stickerEntries = (options.stickers ?? []).map(
		(sticker, index) => [String(index), sticker] as const,
	);
	const byId = <T extends { id: string }>(items: T[] = []) =>
		new Map(items.map((item) => [item.id, item]));

	return {
		id: options.id ?? "1234567890",
		content: options.content ?? "hello",
		type: options.type ?? 0,
		createdAt: new Date("2026-10-08T07:42:00Z"),
		editedTimestamp: null,
		author: options.author
			? {
					...options.author,
					displayAvatarURL: () => undefined,
				}
			: undefined,
		member: options.member
			? {
					...options.member,
					displayAvatarURL: () => undefined,
				}
			: null,
		mentions: {
			users: byId(options.mentions?.users),
			members: null,
			roles: byId(options.mentions?.roles),
			channels: byId(options.mentions?.channels),
		},
		channel: {
			id: options.channelId ?? "test-channel",
			name: options.channelName,
			async send(payload: unknown) {
				return options.onSend?.(payload);
			},
		},
		attachments: new Map(attachmentEntries),
		embeds: options.embeds ?? [],
		stickers: new Map(stickerEntries),
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
