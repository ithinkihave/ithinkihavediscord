import { MessageType } from "discord.js";
import { config } from "../../config.ts";
import type { DiscordMessage } from "../messageTypes.ts";
import { incinerateMessage } from "../incinerate/index.ts";
import { readFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import path from "node:path";
import { Piscina } from "piscina";
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
const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 15_000;
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
	// each worker holds its own templates and model; a scan is well under a
	// second now, so a few workers keep up with any channel
	maxThreads: Math.min(4, availableParallelism()),
});

type TargetResult =
	| { target: MediaTarget; bytes: Buffer; match: EyeMatch | null }
	| { target: MediaTarget; error: unknown };

export function isEyesChannelMessage(message: DiscordMessage): boolean {
	const configuredChannelId = config.channels.eyesChannelId;
	if (configuredChannelId && message.channel?.id === configuredChannelId) {
		return true;
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
	if (normalizedContentType.startsWith("image/gif")) {
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
			embed.video?.url,
			embed.image?.url,
			embed.thumbnail?.url,
			embed.url,
		];

		for (const url of candidates) {
			const mediaKind = url ? inferMediaKind(url, null) : null;
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
	if (!isEyesChannelMessage(message)) {
		return false;
	}

	let targets = collectMediaTargetsFromMessage(message);
	if (targets.length === 0 && hasUnresolvedLink(message)) {
		message = await waitForEmbeds(message);
		targets = collectMediaTargetsFromMessage(message);
	}

	if (targets.length === 0) {
		if (
			!config.eyes.filterTextMessages ||
			!isUserPost(message) ||
			messageTextHasEyes(message)
		) {
			return false;
		}
		console.log("[bot] text-only post without eyes, incinerating");
		await incinerateMessage(message, {
			timeZone: config.eyes.timeZone,
			format: config.eyes.effectFormat,
		});
		return true;
	}

	const scanStartedAt = performance.now();
	const outcome = await scanUntilFirstMatch(targets);
	const scanMs = Math.round(performance.now() - scanStartedAt);

	if (outcome.hit) {
		const { match, target } = outcome.hit;
		console.log(
			`[bot] eyes match in ${scanMs}ms: ${match.templateName} frame=${match.frameIndex} score=${match.score.toFixed(3)} corr=${match.correlation.toFixed(3)} colorΔ=${match.colorDistance.toFixed(1)} source=${target.url}`,
		);
		await message.react(EYES_REACTION);
		return true;
	}

	const failed = outcome.results.filter((result) => "error" in result);
	if (failed.length > 0) {
		// can't prove there are no eyes, so the post lives
		for (const result of failed) {
			console.error(
				`[bot] eyes scan failed for ${result.target.url}`,
				"error" in result ? result.error : undefined,
			);
		}
		return true;
	}

	console.log(
		`[bot] no eyes in ${scanMs}ms across ${targets.length} media, incinerating`,
	);
	const firstScanned = outcome.results.find((result) => "bytes" in result);
	await incinerateMessage(message, {
		media:
			firstScanned && "bytes" in firstScanned
				? {
						bytes: firstScanned.bytes,
						sourceLabel: firstScanned.target.url,
					}
				: null,
		timeZone: config.eyes.timeZone,
		format: config.eyes.effectFormat,
	});
	return true;
}

/**
 * Scans every target in parallel but settles as soon as one has eyes; the
 * rest are irrelevant at that point.
 */
function scanUntilFirstMatch(targets: MediaTarget[]): Promise<{
	hit: { target: MediaTarget; match: EyeMatch } | null;
	results: TargetResult[];
}> {
	return new Promise((resolve) => {
		const results: TargetResult[] = [];
		let settled = false;

		for (const target of targets) {
			scanTarget(target).then((result) => {
				results.push(result);
				if (settled) {
					return;
				}
				if ("match" in result && result.match) {
					settled = true;
					resolve({ hit: { target, match: result.match }, results });
				} else if (results.length === targets.length) {
					settled = true;
					resolve({ hit: null, results });
				}
			});
		}
	});
}

async function scanTarget(target: MediaTarget): Promise<TargetResult> {
	try {
		const bytes = await downloadMedia(target.url);
		const match = await runDetection(bytes, target.kind, target.url);
		return { target, bytes, match };
	} catch (error) {
		return { target, error };
	}
}

async function downloadMedia(url: string): Promise<Buffer> {
	const response = await fetch(url, {
		signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
	});
	if (!response.ok) {
		throw new Error(
			`failed downloading media: ${response.status} ${response.statusText}`,
		);
	}

	const declaredLength = Number(response.headers.get("content-length"));
	if (declaredLength > MAX_MEDIA_BYTES) {
		throw new Error(`media too large: ${declaredLength} bytes`);
	}

	return Buffer.from(await response.arrayBuffer());
}

function hasUnresolvedLink(message: DiscordMessage): boolean {
	return (
		/https?:\/\//.test(message.content ?? "") &&
		message.embeds.length === 0 &&
		typeof message.fetch === "function"
	);
}

async function waitForEmbeds(message: DiscordMessage): Promise<DiscordMessage> {
	let current = message;
	for (let attempt = 0; attempt < EMBED_WAIT_ATTEMPTS; attempt += 1) {
		await new Promise((resolve) => setTimeout(resolve, EMBED_WAIT_MS));
		try {
			current = await current.fetch(true);
		} catch {
			// deleted while we waited, or no access; nothing to do
			return current;
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

	const bytes = await downloadMedia(url);
	return { match: await runDetection(bytes, mediaKind, url, options) };
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
