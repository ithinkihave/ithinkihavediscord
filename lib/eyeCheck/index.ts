import { config } from "../../config.ts";
import type { DiscordMessage } from "../messageTypes.ts";
import { readFile } from "node:fs/promises";
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
const X_REACTION = "❌";
const EYES_CHANNEL_FALLBACK_NAMES = new Set(["eyes", "👀"]);
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

const detectionPool = new Piscina<DetectionTask, EyeMatch | null>({
	filename: new URL("./worker.ts", import.meta.url).href,
	execArgv: ["--import", "tsx/esm"],
	idleTimeout: 30_000,
});

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
		const candidates = [
			{ url: embed.image?.url, contentType: null },
			{ url: embed.thumbnail?.url, contentType: null },
			{ url: embed.video?.url, contentType: null },
			{ url: embed.url, contentType: null },
		];

		for (const candidate of candidates) {
			if (!candidate.url) {
				continue;
			}

			const mediaKind = inferMediaKind(
				candidate.url,
				candidate.contentType,
			);
			if (mediaKind) {
				targets.set(candidate.url, mediaKind);
			}
		}
	}

	return Array.from(targets.entries()).map(([url, kind]) => ({
		url,
		kind,
	}));
}

export async function handleEyesMediaCheck(
	message: DiscordMessage,
): Promise<boolean> {
	if (!isEyesChannelMessage(message)) {
		return false;
	}

	const targets = collectMediaTargetsFromMessage(message);
	if (targets.length === 0) {
		return false;
	}

	const matches = await Promise.all(
		targets.map((target) => mediaContainsEyesEmoji(target)),
	);

	const hitIndex = matches.findIndex((match) => match !== null);
	if (hitIndex >= 0) {
		const match = matches[hitIndex]!;
		const target = targets[hitIndex]!;
		console.log(
			`[bot] eyes match: ${match.templateName} frame=${match.frameIndex} score=${match.score.toFixed(3)} corr=${match.correlation.toFixed(3)} colorΔ=${match.colorDistance.toFixed(1)} source=${target.url}`,
		);
		await message.react(EYES_REACTION);
		return true;
	}

	await message.react(X_REACTION);
	return true;
}

export async function detectEyesInLocalMedia(
	filePath: string,
): Promise<EyeMatch | null> {
	const bytes = await readFile(filePath);
	const mediaKind = inferMediaKind(filePath, null);
	if (!mediaKind) {
		return null;
	}

	return runDetection(bytes, mediaKind, filePath);
}

async function mediaContainsEyesEmoji(
	target: MediaTarget,
): Promise<EyeMatch | null> {
	const response = await fetch(target.url);
	if (!response.ok) {
		throw new Error(
			`failed downloading media: ${response.status} ${response.statusText}`,
		);
	}

	const bytes = Buffer.from(await response.arrayBuffer());
	return runDetection(bytes, target.kind, target.url);
}

function runDetection(
	bytes: Buffer,
	mediaKind: MediaKind,
	sourceLabel: string,
): Promise<EyeMatch | null> {
	return detectionPool.run({ bytes, mediaKind, sourceLabel });
}
