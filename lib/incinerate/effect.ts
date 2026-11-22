import { spawn } from "node:child_process";

export type RgbaImage = {
	data: Buffer;
	width: number;
	height: number;
};

// WebP is a third the size of GIF with real alpha, and Discord animates it
// inline the same way; GIF is kept for anything that can't show WebP.
export type AnimationFormat = "webp" | "gif";

export type EffectOptions = {
	fps: number;
	// intact frames up front, so the swap from the real message is seamless
	holdMs: number;
	activeMs: number;
	// stragglers drifting off after the last of the card is gone
	tailMs: number;
	seed: number;
	format?: AnimationFormat;
};

export type EffectAnimation = {
	data: Buffer;
	format: AnimationFormat;
	durationMs: number;
	frameCount: number;
};

export type FrameEffect = (
	card: RgbaImage,
	options: EffectOptions,
) => Iterable<Buffer>;

export async function renderEffect(
	card: RgbaImage,
	effect: FrameEffect,
	options: EffectOptions,
): Promise<EffectAnimation> {
	const format = options.format ?? "webp";
	const encoded = await encodeAnimation(
		effect(card, options),
		card.width,
		card.height,
		options.fps,
		format,
	);
	const data = format === "webp" ? holdFinalWebpFrame(encoded) : encoded;
	const frameCount = getFrameCount(options);

	return {
		data,
		format,
		durationMs: Math.round((frameCount * 1000) / options.fps),
		frameCount,
	};
}

// the most a WebP frame duration can hold (24 bits of ms, about 4.6 hours)
const MAX_WEBP_FRAME_MS = 0xffffff;

/**
 * Discord loops animated WebP whatever the file asks for (and ffmpeg asks for
 * forever anyway), which would bring the message back from the dead. So mark
 * it play-once and hold the empty final frame for as long as the format
 * allows; the bot deletes it long before that runs out.
 */
export function holdFinalWebpFrame(webp: Buffer): Buffer {
	const out = Buffer.from(webp);
	let lastFrameAt = -1;
	// RIFF header, then chunks: fourcc, little-endian size, padded payload
	for (let offset = 12; offset + 8 <= out.length; ) {
		const fourcc = out.toString("ascii", offset, offset + 4);
		const size = out.readUInt32LE(offset + 4);
		if (fourcc === "ANIM") {
			// payload: background colour (4 bytes), then the loop count
			out.writeUInt16LE(1, offset + 8 + 4);
		} else if (fourcc === "ANMF") {
			lastFrameAt = offset;
		}
		offset += 8 + size + (size & 1);
	}
	if (lastFrameAt >= 0) {
		// ANMF payload: x, y, width-1, height-1 (3 bytes each), then duration
		out.writeUIntLE(MAX_WEBP_FRAME_MS, lastFrameAt + 8 + 12, 3);
	}
	return out;
}

export function createRng(seed: number): () => number {
	let state = seed | 0;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function getFrameCount(options: EffectOptions): number {
	return Math.ceil(
		((options.holdMs + options.activeMs + options.tailMs) * options.fps) /
			1000,
	);
}

/** Bilinear value noise summed over a few octaves, normalised to 0..1. */
export function buildValueNoise(
	width: number,
	height: number,
	cellSizes: number[],
	rng: () => number,
): Float32Array {
	const result = new Float32Array(width * height);
	let amplitude = 1;
	let total = 0;

	for (const cell of cellSizes) {
		const gw = Math.ceil(width / cell) + 2;
		const gh = Math.ceil(height / cell) + 2;
		const grid = new Float32Array(gw * gh);
		for (let i = 0; i < grid.length; i += 1) {
			grid[i] = rng();
		}

		for (let y = 0; y < height; y += 1) {
			const gy = y / cell;
			const y0 = gy | 0;
			const fy = smoothstep(gy - y0);
			for (let x = 0; x < width; x += 1) {
				const gx = x / cell;
				const x0 = gx | 0;
				const fx = smoothstep(gx - x0);
				const a = grid[y0 * gw + x0]!;
				const b = grid[y0 * gw + x0 + 1]!;
				const c = grid[(y0 + 1) * gw + x0]!;
				const d = grid[(y0 + 1) * gw + x0 + 1]!;
				const top = a + (b - a) * fx;
				const bottom = c + (d - c) * fx;
				result[y * width + x]! +=
					(top + (bottom - top) * fy) * amplitude;
			}
		}
		total += amplitude;
		amplitude *= 0.55;
	}

	for (let i = 0; i < result.length; i += 1) {
		result[i] = result[i]! / total;
	}
	return result;
}

const ENCODER_ARGS: Record<AnimationFormat, string[]> = {
	webp: [
		"-c:v",
		"libwebp_anim",
		"-pix_fmt",
		"yuva420p",
		"-quality",
		"75",
		"-f",
		"webp",
	],
	gif: [
		"-filter_complex",
		"[0:v]split[a][b];[a]palettegen=max_colors=128:reserve_transparent=1:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle:alpha_threshold=128",
		// play once, then sit on the empty last frame (for as long as GIF
		// allows) until we delete it
		"-loop",
		"-1",
		"-final_delay",
		"65535",
		"-f",
		"gif",
	],
};

export function encodeAnimation(
	frames: Iterable<Buffer>,
	width: number,
	height: number,
	fps: number,
	format: AnimationFormat,
): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const ffmpeg = spawn("ffmpeg", [
			"-v",
			"error",
			"-f",
			"rawvideo",
			"-pix_fmt",
			"rgba",
			"-s",
			`${width}x${height}`,
			"-r",
			String(fps),
			"-i",
			"pipe:0",
			...ENCODER_ARGS[format],
			"pipe:1",
		]);

		const chunks: Buffer[] = [];
		let stderr = "";
		ffmpeg.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
		ffmpeg.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});
		ffmpeg.on("error", reject);
		ffmpeg.on("close", (code) => {
			if (code === 0) {
				resolve(Buffer.concat(chunks));
				return;
			}
			reject(
				new Error(
					`ffmpeg ${format} encode failed (${code}): ${stderr.trim()}`,
				),
			);
		});
		ffmpeg.stdin.on("error", reject);

		(async () => {
			for (const frame of frames) {
				if (!ffmpeg.stdin.write(frame)) {
					await new Promise((drained) =>
						ffmpeg.stdin.once("drain", drained),
					);
				}
			}
			ffmpeg.stdin.end();
		})().catch(reject);
	});
}

export function smoothstep(t: number): number {
	return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

export function clamp01(value: number): number {
	return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function clampByte(value: number): number {
	return value < 0 ? 0 : value > 255 ? 255 : value;
}

export function hashUnit(i: number, seed: number): number {
	let h = Math.imul(i ^ seed, 0x45d9f3b);
	h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
