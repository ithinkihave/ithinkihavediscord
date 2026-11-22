import { spawn, type ChildProcessByStdio } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";
import sharp from "sharp";
import type { MediaKind } from "./types.ts";

// Frames are decoded at most this big; the scan pyramid never goes higher.
export const MAX_DECODE_SIZE = 720;
// Past this, decode keyframes only: seeking a long video beats decoding it all.
const KEYFRAMES_ONLY_AFTER_SECONDS = 12;
const DECODER_TIMEOUT_MS = 15_000;
// A frame is a repeat of one already scanned when no cell of a 16x16
// luminance thumbnail moved by this much (0-255). Max rather than mean, so a
// small emoji popping into an otherwise static shot still counts as new.
const DUPLICATE_FRAME_DIFF = 3;
const SIGNATURE_SIZE = 16;
const PAM_HEADER_END = "ENDHDR\n";
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export type RgbFrame = {
	width: number;
	height: number;
	// tightly packed RGB, already flattened onto white
	rgb: Buffer;
};

export type DecodedMedia = {
	// size of the original media, for mapping matches back to it
	sourceWidth: number;
	sourceHeight: number;
	frames: AsyncGenerator<RgbFrame>;
};

/**
 * Decodes up to `maxFrames` frames spread across the media. Animated media
 * is decoded by a single ffmpeg pass that streams frames as it goes, so the
 * first frame can be scanned while the rest are still decoding, and an early
 * match can stop ffmpeg outright (by returning from the generator).
 * Near-duplicate frames are skipped.
 */
export async function decodeMedia(
	bytes: Buffer,
	mediaKind: MediaKind,
	sourceLabel: string,
	maxFrames: number,
): Promise<DecodedMedia> {
	const apngFrameCount = readApngFrameCount(bytes);
	const isWebp =
		bytes.toString("latin1", 0, 4) === "RIFF" &&
		bytes.toString("latin1", 8, 12) === "WEBP";
	if (isWebp || (apngFrameCount === null && mediaKind === "image")) {
		return decodeImage(bytes, maxFrames);
	}

	const workspace = await mkdtemp(path.join(tmpdir(), "eyes-check-"));
	try {
		const extension =
			apngFrameCount === null
				? path.extname(sourceLabel.split("?")[0] ?? "") || ".bin"
				: ".apng";
		const sourcePath = path.join(workspace, `source${extension}`);
		await writeFile(sourcePath, bytes);
		const probe = await probeMedia(sourcePath).catch(() => null);
		const frameIndices =
			apngFrameCount === null
				? null
				: sampleFrameIndices(apngFrameCount, maxFrames);
		const frames = streamFrames(
			sourcePath,
			probe,
			maxFrames,
			extension,
			frameIndices,
		);

		return {
			sourceWidth: probe?.width ?? 0,
			sourceHeight: probe?.height ?? 0,
			frames: withCleanup(
				frameIndices ? frames : dropDuplicateFrames(frames),
				() => rm(workspace, { recursive: true, force: true }),
			),
		};
	} catch (error) {
		await rm(workspace, { recursive: true, force: true });
		throw error;
	}
}

function readApngFrameCount(bytes: Buffer): number | null {
	if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
		return null;
	}
	// APNG's animation control chunk precedes the first image data chunk.
	for (let offset = PNG_SIGNATURE.length; offset + 12 <= bytes.length; ) {
		const size = bytes.readUInt32BE(offset);
		const type = bytes.toString("ascii", offset + 4, offset + 8);
		const next = offset + 12 + size;
		if (type === "acTL") {
			if (size !== 8 || next > bytes.length) {
				throw new Error("invalid APNG animation control chunk");
			}
			const count = bytes.readUInt32BE(offset + 8);
			if (count === 0) {
				throw new Error("APNG has no frames");
			}
			return count;
		}
		if (type === "IDAT" || next > bytes.length) {
			break;
		}
		offset = next;
	}
	return null;
}

function sampleFrameIndices(frameCount: number, maxFrames: number): number[] {
	const count = Math.min(frameCount, maxFrames);
	return Array.from({ length: count }, (_, index) =>
		count === 1 ? 0 : Math.round((index * (frameCount - 1)) / (count - 1)),
	);
}

async function decodeImage(
	bytes: Buffer,
	maxFrames: number,
): Promise<DecodedMedia> {
	const metadata = await sharp(bytes).metadata();
	const pages = sampleFrameIndices(metadata.pages ?? 1, maxFrames);
	return {
		sourceWidth: metadata.width ?? 0,
		sourceHeight: metadata.pageHeight ?? metadata.height ?? 0,
		frames: (async function* () {
			for (const page of pages) {
				yield await decodeImagePage(bytes, page);
			}
		})(),
	};
}

async function decodeImagePage(bytes: Buffer, page: number): Promise<RgbFrame> {
	const { data, info } = await sharp(bytes, { page, pages: 1 })
		.resize({
			width: MAX_DECODE_SIZE,
			height: MAX_DECODE_SIZE,
			fit: "inside",
			withoutEnlargement: true,
		})
		.flatten({ background: { r: 255, g: 255, b: 255 } })
		.toColourspace("srgb")
		.removeAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });

	return { width: info.width, height: info.height, rgb: data };
}

async function* withCleanup<T>(
	source: AsyncGenerator<T>,
	cleanup: () => Promise<unknown>,
): AsyncGenerator<T> {
	try {
		yield* source;
	} finally {
		await cleanup();
	}
}

type Probe = { duration: number; width: number; height: number };

async function probeMedia(sourcePath: string): Promise<Probe> {
	const output = await collectProcess("ffprobe", [
		"-v",
		"error",
		"-select_streams",
		"v:0",
		"-show_entries",
		"format=duration:stream=width,height:stream_side_data=rotation",
		"-of",
		"json",
		"-protocol_whitelist",
		"file",
		sourcePath,
	]);
	const parsed = JSON.parse(output.toString()) as {
		format?: { duration?: string };
		streams?: Array<{
			width?: number;
			height?: number;
			side_data_list?: Array<{ rotation?: number }>;
		}>;
	};
	const stream = parsed.streams?.[0];
	const rotation = Math.abs(stream?.side_data_list?.[0]?.rotation ?? 0);
	// ffmpeg autorotates, so report the size as displayed
	const swap = rotation === 90 || rotation === 270;
	return {
		duration: Number.parseFloat(parsed.format?.duration ?? ""),
		width: (swap ? stream?.height : stream?.width) ?? 0,
		height: (swap ? stream?.width : stream?.height) ?? 0,
	};
}

/**
 * One ffmpeg pass selects frames by index for APNG and by timestamp for
 * other formats. It scales frames down to MAX_DECODE_SIZE and streams them
 * as PAM so each frame carries its own dimensions.
 */
async function* streamFrames(
	sourcePath: string,
	probe: Probe | null,
	maxFrames: number,
	extension: string,
	frameIndices: number[] | null,
): AsyncGenerator<RgbFrame> {
	const duration = probe?.duration ?? NaN;
	const hasDuration = Number.isFinite(duration) && duration > 0;
	const step = hasDuration ? duration / maxFrames : 1e9;
	const keyframesOnly =
		!frameIndices &&
		hasDuration &&
		duration > KEYFRAMES_ONLY_AFTER_SECONDS &&
		extension.toLowerCase() !== ".gif";

	const select = frameIndices
		? frameIndices.map((index) => `eq(n\\,${index})`).join("+")
		: `isnan(prev_selected_t)+gte(t-prev_selected_t\\,${step.toFixed(4)})`;
	const filters = [
		`select='${select}'`,
		`scale='min(${MAX_DECODE_SIZE},iw)':'min(${MAX_DECODE_SIZE},ih)':force_original_aspect_ratio=decrease`,
	];

	const ffmpeg = spawn(
		"ffmpeg",
		[
			"-v",
			"error",
			...(frameIndices ? ["-xerror"] : []),
			...(keyframesOnly ? ["-skip_frame", "nokey"] : []),
			"-protocol_whitelist",
			"file",
			"-i",
			sourcePath,
			"-vf",
			filters.join(","),
			"-fps_mode",
			"passthrough",
			"-frames:v",
			String(maxFrames),
			"-pix_fmt",
			"rgba",
			"-c:v",
			"pam",
			"-f",
			"image2pipe",
			"pipe:1",
		],
		{
			stdio: ["ignore", "pipe", "pipe"],
			timeout: DECODER_TIMEOUT_MS,
			killSignal: "SIGKILL",
		},
	);

	let stderr = "";
	ffmpeg.stderr.on("data", (chunk: Buffer) => {
		stderr += chunk.toString();
	});
	const exited = new Promise<number | null>((resolve) => {
		ffmpeg.on("close", resolve);
		ffmpeg.on("error", () => resolve(-1));
	});

	let yielded = 0;
	try {
		for await (const frame of parsePamStream(ffmpeg)) {
			yielded += 1;
			yield flattenOnWhite(frame);
		}
		const code = await exited;
		if (code !== 0 || yielded === 0) {
			throw new Error(`ffmpeg failed (${code}): ${stderr.trim()}`);
		}
		if (frameIndices && yielded !== frameIndices.length) {
			throw new Error(
				`decoded only ${yielded} of ${frameIndices.length} selected APNG frames`,
			);
		}
	} finally {
		if (ffmpeg.exitCode === null) {
			ffmpeg.kill("SIGKILL");
		}
	}
}

type RgbaFrame = { width: number; height: number; rgba: Buffer };

/** Incremental PAM parser: frames are yielded as soon as their bytes land. */
async function* parsePamStream(
	child: ChildProcessByStdio<null, Readable, Readable>,
): AsyncGenerator<RgbaFrame> {
	let header = Buffer.alloc(0);
	let frame: (RgbaFrame & { filled: number }) | null = null;

	for await (const chunk of child.stdout as AsyncIterable<Buffer>) {
		let data = chunk;
		while (data.length > 0) {
			if (!frame) {
				header = Buffer.concat([header, data]);
				const end = header.indexOf(PAM_HEADER_END, 0, "latin1");
				if (end < 0) {
					break;
				}
				frame = parsePamHeader(header.toString("latin1", 0, end));
				data = header.subarray(end + PAM_HEADER_END.length);
				header = Buffer.alloc(0);
			}

			const take = Math.min(
				data.length,
				frame.rgba.length - frame.filled,
			);
			data.copy(frame.rgba, frame.filled, 0, take);
			frame.filled += take;
			data = data.subarray(take);

			if (frame.filled === frame.rgba.length) {
				yield {
					width: frame.width,
					height: frame.height,
					rgba: frame.rgba,
				};
				frame = null;
			}
		}
	}
}

function parsePamHeader(text: string): RgbaFrame & { filled: number } {
	const field = (key: string) =>
		Number(new RegExp(`${key} (\\d+)`).exec(text)?.[1] ?? NaN);
	const width = field("WIDTH");
	const height = field("HEIGHT");
	if (!(width > 0 && height > 0) || field("DEPTH") !== 4) {
		throw new Error(`unexpected PAM header: ${text}`);
	}
	return {
		width,
		height,
		rgba: Buffer.allocUnsafe(width * height * 4),
		filled: 0,
	};
}

function flattenOnWhite({ width, height, rgba }: RgbaFrame): RgbFrame {
	const pixelCount = width * height;
	const rgb = Buffer.allocUnsafe(pixelCount * 3);
	for (let i = 0; i < pixelCount; i += 1) {
		const pi = i * 4;
		const alpha = rgba[pi + 3]!;
		if (alpha === 255) {
			rgb[i * 3] = rgba[pi]!;
			rgb[i * 3 + 1] = rgba[pi + 1]!;
			rgb[i * 3 + 2] = rgba[pi + 2]!;
			continue;
		}
		const a = alpha / 255;
		const background = 255 * (1 - a);
		rgb[i * 3] = Math.round(rgba[pi]! * a + background);
		rgb[i * 3 + 1] = Math.round(rgba[pi + 1]! * a + background);
		rgb[i * 3 + 2] = Math.round(rgba[pi + 2]! * a + background);
	}
	return { width, height, rgb };
}

async function* dropDuplicateFrames(
	frames: AsyncGenerator<RgbFrame>,
): AsyncGenerator<RgbFrame> {
	const seen: Float32Array[] = [];
	for await (const frame of frames) {
		const signature = frameSignature(frame);
		if (
			seen.some(
				(other) =>
					maxAbsoluteDifference(other, signature) <
					DUPLICATE_FRAME_DIFF,
			)
		) {
			continue;
		}
		seen.push(signature);
		yield frame;
	}
}

// Tiny box-averaged luminance thumbnail used to spot repeated frames.
function frameSignature(frame: RgbFrame): Float32Array {
	const sums = new Float32Array(SIGNATURE_SIZE * SIGNATURE_SIZE);
	const counts = new Uint32Array(SIGNATURE_SIZE * SIGNATURE_SIZE);
	for (let y = 0; y < frame.height; y += 1) {
		const cellY = ((y * SIGNATURE_SIZE) / frame.height) | 0;
		for (let x = 0; x < frame.width; x += 1) {
			const cell =
				cellY * SIGNATURE_SIZE +
				(((x * SIGNATURE_SIZE) / frame.width) | 0);
			const i = (y * frame.width + x) * 3;
			sums[cell]! +=
				0.2126 * frame.rgb[i]! +
				0.7152 * frame.rgb[i + 1]! +
				0.0722 * frame.rgb[i + 2]!;
			counts[cell]! += 1;
		}
	}
	for (let i = 0; i < sums.length; i += 1) {
		sums[i] = counts[i] ? sums[i]! / counts[i]! : 0;
	}
	return sums;
}

function maxAbsoluteDifference(a: Float32Array, b: Float32Array): number {
	let max = 0;
	for (let i = 0; i < a.length; i += 1) {
		max = Math.max(max, Math.abs(a[i]! - b[i]!));
	}
	return max;
}

function collectProcess(command: string, args: string[]): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			timeout: DECODER_TIMEOUT_MS,
			killSignal: "SIGKILL",
		});
		const stdout: Buffer[] = [];
		let stderr = "";
		child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});
		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) {
				resolve(Buffer.concat(stdout));
				return;
			}
			reject(new Error(`${command} failed (${code}): ${stderr.trim()}`));
		});
	});
}
