import type { DiscordMessage } from "../../lib/messageTypes.ts";

export type MockMember = {
	setNickname: (nickname: string) => Promise<void>;
};

export type MockMessageOptions = {
	id?: string;
	content?: string;
	channelId?: string;
	channelName?: string;
	attachments?: Array<{
		url: string;
		contentType?: string | null;
		spoiler?: boolean;
	}>;
	embeds?: Array<{
		image?: { url?: string; proxyURL?: string };
		thumbnail?: { url?: string; proxyURL?: string };
		video?: { url?: string; proxyURL?: string };
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
	onFetch?: (
		message: DiscordMessage,
	) => DiscordMessage | Promise<DiscordMessage>;
	onReact?: (emoji: string) => void | Promise<void>;
	onReply?: (response: string) => void | Promise<void>;
	onSend?: (payload: unknown) => unknown;
	guildMembers?: Record<string, MockMember>;
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

	const message = {
		id: options.id ?? "1234567890",
		content: options.content ?? "hello",
		guild,
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
			messages: { fetch: () => message.fetch() },
		},
		attachments: new Map(attachmentEntries),
		embeds: options.embeds ?? [],
		stickers: new Map(stickerEntries),
		async delete() {
			await options.onDelete?.();
		},
		async fetch() {
			const message = this as unknown as DiscordMessage;
			return options.onFetch?.(message) ?? message;
		},
		async react(emoji: string) {
			await options.onReact?.(emoji);
		},
		async reply(response: string) {
			await options.onReply?.(response);
		},
	} as unknown as DiscordMessage;
	return message;
}
