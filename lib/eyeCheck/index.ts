import { MessageType } from "discord.js";
import { config } from "../../config.ts";
import type { DiscordMessage } from "../messageTypes.ts";
import { incinerateMessage, messageVersion } from "../incinerate/index.ts";
import { readFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import path from "node:path";
import { Piscina } from "piscina";
import { downloadMedia, isTrustedMediaUrl } from "./download.ts";
import {
	type DetectionTask,
	type EyeMatch,
	type MediaKind,
	type MediaTarget,
	EYES_DETECTION_THRESHOLD,
	getEvenlySpacedTimestamps,
} from "./types.ts";

export { EYES_DETECTION_THRESHOLD, getEvenlySpacedTimestamps };
export type { EyeMatch, MediaKind, MediaTarget };

const EYES_REACTION = "👀";
const EYES_EMOJI = "👀";
const EYES_CHANNEL_FALLBACK_NAMES = new Set(["eyes", "👀"]);
const MAX_ACTIVE_SCANS = Math.min(4, availableParallelism());
// link embeds (tenor, giphy...) often land in a later edit, not on create
const EMBED_WAIT_MS = 1_500;
const EMBED_WAIT_ATTEMPTS = 2;
const MEDIA_IMAGE_EXTENSIONS = new Set([
	".png",
	".jpg",
	".jpeg",
	".webp",
	".bmp",
	".avif",
	".heic",
]);
const MEDIA_ANIMATED_EXTENSIONS = new Set([
	".gif",
	".apng",
	".mp4",
	".webm",
	".mov",
	".mkv",
	".avi",
	".m4v",
]);
// people's posts; pins, joins, thread notices and the like are left alone
const FILTERABLE_MESSAGE_TYPES = new Set<MessageType>([
	MessageType.Default,
	MessageType.Reply,
]);
// Discord sticker formats: 1 png, 2 apng, 3 lottie, 4 gif
const STICKER_FORMAT_KINDS = new Map<number, MediaKind>([
	[1, "image"],
	[2, "animated"],
	[4, "animated"],
]);

const detectionPool = new Piscina<DetectionTask, EyeMatch | null>({
	filename: new URL("./worker.ts", import.meta.url).href,
	execArgv: ["--import", "tsx/esm"],
	idleTimeout: 30_000,
	maxThreads: MAX_ACTIVE_SCANS,
	maxQueue: 32,
});

let activeScans = 0;

export class EyesScanBusyError extends Error {}

async function withScanSlot<T>(
	scan: () => Promise<T>,
	whenBusy: () => T,
): Promise<T> {
	if (activeScans >= MAX_ACTIVE_SCANS) {
		return whenBusy();
	}
	activeScans += 1;
	try {
		return await scan();
	} finally {
		activeScans -= 1;
	}
}

export function isEyesChannelMessage(message: DiscordMessage): boolean {
	const configuredChannelId = config.channels.eyesChannelId;
	if (configuredChannelId) {
		return message.channel?.id === configuredChannelId;
	}

	const channelName =
		typeof message.channel === "object" &&
		message.channel !== null &&
		"name" in message.channel
			? String(
					(message.channel as { name?: string }).name ?? "",
				).toLowerCase()
			: "";

	return channelName ? EYES_CHANNEL_FALLBACK_NAMES.has(channelName) : false;
}

function inferMediaKind(
	url: string,
	contentType: string | null,
): MediaKind | null {
	const normalizedContentType = String(contentType ?? "").toLowerCase();
	if (
		normalizedContentType.startsWith("image/gif") ||
		normalizedContentType.startsWith("image/apng")
	) {
		return "animated";
	}
	if (normalizedContentType.startsWith("video/")) {
		return "animated";
	}
	if (normalizedContentType.startsWith("image/")) {
		return "image";
	}

	const cleanUrl = url.split("?")[0] ?? url;
	const extension = path.extname(cleanUrl).toLowerCase();
	if (MEDIA_ANIMATED_EXTENSIONS.has(extension)) {
		return "animated";
	}
	if (MEDIA_IMAGE_EXTENSIONS.has(extension)) {
		return "image";
	}

	return null;
}

export function collectMediaTargetsFromMessage(
	message: DiscordMessage,
): MediaTarget[] {
	const targets = new Map<string, MediaKind>();

	for (const attachment of message.attachments.values()) {
		const mediaKind = inferMediaKind(
			attachment.url,
			attachment.contentType ?? null,
		);
		if (mediaKind) {
			targets.set(attachment.url, mediaKind);
		}
	}

	for (const embed of message.embeds) {
		// one target per embed: a tenor embed's thumbnail is just a still of
		// its video, so scanning both doubles the work for nothing
		const candidates = [
			{ asset: embed.video, kind: "animated" },
			{ asset: embed.image, kind: "image" },
			{ asset: embed.thumbnail, kind: "image" },
			{ asset: { url: embed.url, proxyURL: undefined }, kind: null },
		] as const;

		for (const { asset, kind } of candidates) {
			if (!asset) {
				continue;
			}
			const { url: source, proxyURL } = asset;
			const url =
				proxyURL && isTrustedMediaUrl(proxyURL)
					? proxyURL
					: (source ?? proxyURL);
			const mediaKind =
				(source && inferMediaKind(source, null)) ||
				(url && inferMediaKind(url, null)) ||
				(url && isTrustedMediaUrl(url) && kind);
			if (url && mediaKind) {
				targets.set(url, mediaKind);
				break;
			}
		}
	}

	for (const sticker of message.stickers?.values?.() ?? []) {
		const mediaKind = STICKER_FORMAT_KINDS.get(sticker.format);
		if (mediaKind && sticker.url) {
			targets.set(sticker.url, mediaKind);
		}
	}

	return Array.from(targets.entries()).map(([url, kind]) => ({
		url,
		kind,
	}));
}

export function textContainsEyes(text: string): boolean {
	return text.includes(EYES_EMOJI) || /<a?:[^:]*eye[^:]*:\d+>/i.test(text);
}

/** 👀 in the text, or a sticker we can't scan (lottie) that's named for it. */
function messageTextHasEyes(message: DiscordMessage): boolean {
	const stickers = Array.from(message.stickers?.values?.() ?? []);
	return (
		textContainsEyes(message.content ?? "") ||
		stickers.some((sticker) => /eye|👀/i.test(sticker.name ?? ""))
	);
}

function isUserPost(message: DiscordMessage): boolean {
	return message.type == null || FILTERABLE_MESSAGE_TYPES.has(message.type);
}

export async function handleEyesMediaCheck(
	message: DiscordMessage,
): Promise<boolean> {
	if (!isEyesChannelMessage(message) || !isUserPost(message)) {
		return false;
	}
	return withScanSlot(
		() => checkEyesMessage(message),
		() => true,
	);
}

async function checkEyesMessage(message: DiscordMessage): Promise<boolean> {
	if (hasUnresolvedLink(message)) {
		const refreshed = await waitForEmbeds(message);
		if (!refreshed) {
			return true;
		}
		message = refreshed;
	}

	const targets = collectMediaTargetsFromMessage(message);
	const incineration = {
		expectedVersion: messageVersion(message),
		timeZone: config.eyes.timeZone,
		format: config.eyes.effectFormat,
	};

	if (targets.length === 0) {
		if (!config.eyes.filterTextMessages || messageTextHasEyes(message)) {
			return false;
		}
		console.log("[bot] text-only post without eyes, incinerating");
		await incinerateMessage(message, incineration);
		return true;
	}

	const scanStartedAt = performance.now();
	let scanFailed = false;
	let preview: { bytes: Buffer; sourceLabel: string } | undefined;
	for (const target of targets) {
		let bytes: Buffer;
		let match: EyeMatch | null;
		try {
			bytes = await downloadMedia(target.url);
			match = await runDetection(bytes, target.kind, target.url);
		} catch (error) {
			scanFailed = true;
			console.error("[bot] eyes scan failed", error);
			continue;
		}
		if (match) {
			const scanMs = Math.round(performance.now() - scanStartedAt);
			console.log(
				`[bot] eyes match in ${scanMs}ms: ${match.templateName} frame=${match.frameIndex} score=${match.score.toFixed(3)} corr=${match.correlation.toFixed(3)} colorΔ=${match.colorDistance.toFixed(1)}`,
			);
			await message.react(EYES_REACTION);
			return true;
		}
		preview ??= { bytes, sourceLabel: target.url };
	}
	if (scanFailed) {
		// can't prove there are no eyes, so the post lives
		return true;
	}

	const scanMs = Math.round(performance.now() - scanStartedAt);
	console.log(
		`[bot] no eyes in ${scanMs}ms across ${targets.length} media, incinerating`,
	);
	await incinerateMessage(message, {
		...incineration,
		media: preview,
	});
	return true;
}

function hasUnresolvedLink(message: DiscordMessage): boolean {
	return (
		/https?:\/\//.test(message.content ?? "") &&
		message.embeds.length === 0 &&
		typeof message.fetch === "function"
	);
}

async function waitForEmbeds(
	message: DiscordMessage,
): Promise<DiscordMessage | null> {
	let current = message;
	for (let attempt = 0; attempt < EMBED_WAIT_ATTEMPTS; attempt += 1) {
		await new Promise((resolve) => setTimeout(resolve, EMBED_WAIT_MS));
		try {
			current = await current.fetch(true);
		} catch {
			return null;
		}
		if (current.embeds.length > 0) {
			break;
		}
	}
	return current;
}

/**
 * One-off scan of a media URL, for commands rather than the channel filter.
 * Returns null when the URL isn't something we know how to scan.
 */
export async function scanMediaUrl(
	url: string,
	contentType: string | null,
	options: { includeFrame?: boolean } = {},
): Promise<{ match: EyeMatch | null } | null> {
	const mediaKind = inferMediaKind(url, contentType);
	if (!mediaKind) {
		return null;
	}

	return withScanSlot(
		async () => {
			const bytes = await downloadMedia(url);
			return {
				match: await runDetection(bytes, mediaKind, url, options),
			};
		},
		() => {
			throw new EyesScanBusyError("media scan capacity reached");
		},
	);
}

export async function detectEyesInLocalMedia(
	filePath: string,
	options: { includeFrame?: boolean } = {},
): Promise<EyeMatch | null> {
	const bytes = await readFile(filePath);
	const mediaKind = inferMediaKind(filePath, null);
	if (!mediaKind) {
		return null;
	}

	return runDetection(bytes, mediaKind, filePath, options);
}

function runDetection(
	bytes: Buffer,
	mediaKind: MediaKind,
	sourceLabel: string,
	options: { includeFrame?: boolean } = {},
): Promise<EyeMatch | null> {
	return detectionPool.run({
		bytes,
		mediaKind,
		sourceLabel,
		includeFrame: options.includeFrame,
	});
}
