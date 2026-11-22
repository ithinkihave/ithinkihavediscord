import { AttachmentBuilder, type Message } from "discord.js";
import type { DiscordMessage } from "../messageTypes.ts";
import { renderBlackhole } from "./blackhole.ts";
import { renderBurn } from "./burn.ts";
import { renderMessageCard } from "./card.ts";
import { renderCrt } from "./crt.ts";
import { renderDust } from "./dust.ts";
import type {
	AnimationFormat,
	EffectAnimation,
	EffectOptions,
	RgbaImage,
} from "./effect.ts";
import { renderMelt } from "./melt.ts";
import { extractPreviewFrame } from "./preview.ts";

export { renderMessageCard };

const AVATAR_SIZE = 128;
const FETCH_TIMEOUT_MS = 5_000;
// leave the finished animation up briefly so slow clients see all of it
const LINGER_AFTER_EFFECT_MS = 1_500;
// Discord API error for a message that no longer exists
const UNKNOWN_MESSAGE = 10008;

const CAPTION = "-# no 👀 detected";

export const EFFECTS = {
	burn: renderBurn,
	dust: renderDust,
	melt: renderMelt,
	crt: renderCrt,
	blackhole: renderBlackhole,
} satisfies Record<
	string,
	(
		card: RgbaImage,
		options: Partial<EffectOptions>,
	) => Promise<EffectAnimation>
>;

export type EffectName = keyof typeof EFFECTS;

let lastEffect: EffectName | null = null;
const MENTION_START = "\ue000";
const MENTION_END = "\ue001";

export type IncinerateOptions = {
	// already-downloaded media to show on the card, so we don't fetch twice
	media?: { bytes: Buffer; sourceLabel: string } | null;
	// webp unless told otherwise
	format?: AnimationFormat;
	// random when not given
	effect?: EffectName;
	timeZone?: string;
	scheduleCleanup?: (cleanup: () => void, delayMs: number) => void;
};

/**
 * Replaces a message with an animation of itself being destroyed (burnt,
 * dusted, melted, switched off or swallowed by a black hole), then removes
 * the animation once it has played. Falls back to a plain delete if
 * rendering fails, so a broken renderer never lets a message through.
 */
export async function incinerateMessage(
	message: DiscordMessage,
	options: IncinerateOptions = {},
): Promise<void> {
	const effect = options.effect ?? pickEffect();
	const startedAt = performance.now();
	const rendered = await renderMessageEffect(message, effect, options).catch(
		(error) => {
			console.error(
				"[bot] failed rendering incineration, deleting",
				error,
			);
			return null;
		},
	);

	if (!rendered || typeof message.channel?.send !== "function") {
		await message.delete();
		return;
	}

	const renderedAt = performance.now();
	// Upload first, delete second: the animation opens on the intact message, so
	// the swap looks seamless instead of leaving a gap while it uploads.
	const sent: Message = await message.channel.send({
		content: CAPTION,
		files: [
			new AttachmentBuilder(rendered.data, {
				name: `incinerated.${rendered.format}`,
			}),
		],
		allowedMentions: { parse: [] },
	});

	try {
		await message.delete();
	} catch (error) {
		// already gone (the author got there first) is as good as deleted
		if ((error as { code?: number }).code !== UNKNOWN_MESSAGE) {
			// can't remove the original, so don't leave a fake funeral behind
			await sent.delete().catch(() => {});
			throw error;
		}
	}
	console.log(
		`[bot] ${effect} sent: render ${Math.round(renderedAt - startedAt)}ms, upload+delete ${Math.round(performance.now() - renderedAt)}ms, ${(rendered.data.length / 1024).toFixed(0)}KB ${rendered.format}`,
	);

	const schedule =
		options.scheduleCleanup ??
		// a pending cleanup shouldn't hold the process open on shutdown
		((cleanup, delayMs) => void setTimeout(cleanup, delayMs).unref());
	schedule(() => {
		sent.delete().catch((error: unknown) => {
			console.error("[bot] failed cleaning up incineration", error);
		});
	}, rendered.durationMs + LINGER_AFTER_EFFECT_MS);
}

/** A random effect, never the same one twice in a row. */
export function pickEffect(random: () => number = Math.random): EffectName {
	const names = (Object.keys(EFFECTS) as EffectName[]).filter(
		(name) => name !== lastEffect,
	);
	lastEffect = names[Math.floor(random() * names.length)]!;
	return lastEffect;
}

export async function renderMessageEffect(
	message: DiscordMessage,
	effect: EffectName,
	options: IncinerateOptions = {},
): Promise<EffectAnimation> {
	const [avatar, media] = await Promise.all([
		fetchAvatar(message),
		options.media
			? extractPreviewFrame(
					options.media.bytes,
					options.media.sourceLabel,
				)
			: Promise.resolve(null),
	]);

	const card = await renderMessageCard({
		displayName:
			message.member?.displayName ??
			message.author?.globalName ??
			message.author?.username ??
			"someone",
		nameColor: message.member?.displayHexColor ?? null,
		avatar,
		timestamp: message.createdAt ?? new Date(),
		content: formatMessageContent(message),
		media,
		isEdited: Boolean(message.editedTimestamp),
		timeZone: options.timeZone,
		transparent: (options.format ?? "webp") === "webp",
	});

	// same message, same fire
	return EFFECTS[effect](card, {
		seed: hashString(message.id ?? ""),
		format: options.format,
	});
}

function hashString(text: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i += 1) {
		hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
	}
	return hash >>> 0;
}

async function fetchAvatar(message: DiscordMessage): Promise<Buffer | null> {
	const avatarOptions = {
		extension: "png",
		size: AVATAR_SIZE,
		forceStatic: true,
	} as const;
	const url =
		message.member?.displayAvatarURL(avatarOptions) ??
		message.author?.displayAvatarURL(avatarOptions);
	if (!url) {
		return null;
	}

	try {
		const response = await fetch(url, {
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
		return response.ok ? Buffer.from(await response.arrayBuffer()) : null;
	} catch (error) {
		console.error("[bot] failed fetching avatar", error);
		return null;
	}
}

/**
 * Resolves the raw message syntax (<@id>, <#id>, <:emoji:id>, <t:unix>) into
 * what a reader would see. Mentions are wrapped in private-use markers so the
 * card renderer can draw them as pills.
 */
export function formatMessageContent(message: DiscordMessage): string {
	const content = message.content ?? "";
	if (isBareEmbeddedLink(message)) {
		return "";
	}

	const mention = (label: string) => `${MENTION_START}${label}${MENTION_END}`;
	const mentions = message.mentions;

	return content
		.replace(/<@!?(\d+)>/g, (_, id: string) => {
			const name =
				mentions?.members?.get(id)?.displayName ??
				mentions?.users?.get(id)?.globalName ??
				mentions?.users?.get(id)?.username ??
				"unknown-user";
			return mention(`@${name}`);
		})
		.replace(/<@&(\d+)>/g, (_, id: string) =>
			mention(`@${mentions?.roles?.get(id)?.name ?? "unknown-role"}`),
		)
		.replace(/<#(\d+)>/g, (_, id: string) => {
			const channel = mentions?.channels?.get(id);
			const name =
				channel && "name" in channel && channel.name
					? channel.name
					: "unknown";
			return mention(`#${name}`);
		})
		.replace(/<a?:(\w+):\d+>/g, ":$1:")
		.replace(/<t:(\d+)(?::[tTdDfFR])?>/g, (_, seconds: string) =>
			new Date(Number(seconds) * 1000).toLocaleString("en-NZ"),
		);
}

/** Discord hides the link text when a message is just a gif/image link. */
function isBareEmbeddedLink(message: DiscordMessage): boolean {
	const content = (message.content ?? "").trim();
	return (
		/^https?:\/\/\S+$/.test(content) &&
		(message.embeds ?? []).some(
			(embed) => embed.video || embed.image || embed.thumbnail,
		)
	);
}
