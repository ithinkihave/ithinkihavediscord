import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";
import {
	type DetectionTask,
	type EyeMatch,
	type MediaKind,
	EYES_DETECTION_THRESHOLD,
	MAX_VIDEO_FRAMES,
	getEvenlySpacedTimestamps,
} from "./types.ts";

const REFERENCE_EYES_DIR = path.resolve("img/reference-eyes");

const TEMPLATE_SIZE = 32;
const FRAME_SCALES = [720, 540, 405, 304, 228, 171, 128, 96, 72];
const WINDOW_STRIDE = 3;
const MAX_COLOR_DISTANCE = 55;
const WEAK_CORRELATION = 0.75;
const MAX_COLOR_DISTANCE_STRICT = 25;
const EARLY_EXIT_CORRELATION = 0.93;
const MIN_FRAME_VARIANCE = 25;

type EyeTemplate = {
	name: string;
	activeCount: number;
	dx: Int16Array;
	dy: Int16Array;
	weights: Float32Array;
	luminanceDeviations: Float32Array;
	luminanceStdDev: number;
	weightSum: number;
	meanR: number;
	meanG: number;
	meanB: number;
};

const eyeTemplatesPromise = loadEyeTemplates();

export default async function detectEyesTask(
	task: DetectionTask,
): Promise<EyeMatch | null> {
	const templates = await eyeTemplatesPromise;
	return detectEyesInMediaBytes(
		task.bytes,
		task.mediaKind,
		task.sourceLabel,
		templates,
	);
}

async function detectEyesInMediaBytes(
	bytes: Buffer,
	mediaKind: MediaKind,
	sourceLabel: string,
	templates: EyeTemplate[],
): Promise<EyeMatch | null> {
	if (mediaKind === "image") {
		const match = await frameContainsEyes(bytes, templates);
		if (!match) {
			return null;
		}

		return {
			...match,
			frameIndex: 0,
		};
	}

	const workspace = await mkdtemp(path.join(tmpdir(), "eyes-check-"));
	try {
		const extension =
			path.extname(sourceLabel.split("?")[0] ?? "") || ".bin";
		const sourcePath = path.join(workspace, `source${extension}`);
		await writeFile(sourcePath, bytes);

		const frames = await extractAnimatedFrames(
			sourcePath,
			workspace,
			MAX_VIDEO_FRAMES,
		);

		let bestMatch: EyeMatch | null = null;
		for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
			const frame = frames[frameIndex];
			if (!frame) {
				continue;
			}

			const match = await frameContainsEyes(frame, templates);
			if (
				match &&
				(!bestMatch || match.correlation > bestMatch.correlation)
			) {
				bestMatch = { ...match, frameIndex };
				if (bestMatch.correlation >= EARLY_EXIT_CORRELATION) {
					return bestMatch;
				}
			}
		}

		return bestMatch;
	} finally {
		await rm(workspace, { recursive: true, force: true });
	}
}

async function extractAnimatedFrames(
	sourcePath: string,
	workspacePath: string,
	maxFrames: number,
): Promise<Buffer[]> {
	const readFirstFrameFallback = async () => {
		const fallbackFramePath = path.join(workspacePath, "frame_000.png");
		await runFfmpeg([
			"-v",
			"error",
			"-i",
			sourcePath,
			"-frames:v",
			"1",
			"-y",
			fallbackFramePath,
		]);
		return [await readFile(fallbackFramePath)];
	};

	const durationSeconds = await probeMediaDuration(sourcePath);
	if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
		return readFirstFrameFallback();
	}

	const timestamps = getEvenlySpacedTimestamps(durationSeconds, maxFrames);
	const extractionResults = await Promise.all(
		timestamps.map(async (timestamp, index) => {
			if (timestamp === undefined) {
				return null;
			}

			const outputPath = path.join(
				workspacePath,
				`frame_${index.toString().padStart(3, "0")}.png`,
			);
			await runFfmpeg([
				"-v",
				"error",
				"-ss",
				String(timestamp),
				"-i",
				sourcePath,
				"-frames:v",
				"1",
				"-y",
				outputPath,
			]);
			return outputPath;
		}),
	);

	const frameBuffers: Buffer[] = [];
	for (const framePath of extractionResults) {
		if (framePath === null) {
			continue;
		}
		try {
			frameBuffers.push(await readFile(framePath));
		} catch {
			continue;
		}
	}

	if (frameBuffers.length === 0) {
		return readFirstFrameFallback();
	}

	return frameBuffers;
}

async function probeMediaDuration(sourcePath: string): Promise<number> {
	const output = await runFfprobe([
		"-v",
		"error",
		"-show_entries",
		"format=duration",
		"-of",
		"default=noprint_wrappers=1:nokey=1",
		sourcePath,
	]);
	return Number.parseFloat(output.trim());
}

function runFfmpeg(args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const process = spawn("ffmpeg", args);
		let stderr = "";

		process.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		process.on("error", reject);
		process.on("close", (code) => {
			if (code === 0) {
				resolve();
				return;
			}

			reject(new Error(`ffmpeg failed (${code}): ${stderr.trim()}`));
		});
	});
}

function runFfprobe(args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		const process = spawn("ffprobe", args);
		let stdout = "";
		let stderr = "";

		process.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString();
		});

		process.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		process.on("error", reject);
		process.on("close", (code) => {
			if (code === 0) {
				resolve(stdout);
				return;
			}

			reject(new Error(`ffprobe failed (${code}): ${stderr.trim()}`));
		});
	});
}

async function loadEyeTemplates(): Promise<EyeTemplate[]> {
	const files = await readdir(REFERENCE_EYES_DIR);
	const pngFiles = files
		.filter((file) => file.toLowerCase().endsWith(".png"))
		.sort();

	return Promise.all(
		pngFiles.map(async (file) => {
			const buffer = await readFile(path.join(REFERENCE_EYES_DIR, file));
			return buildTemplate(buffer, file);
		}),
	);
}

async function buildTemplate(
	source: Buffer,
	fileName: string,
): Promise<EyeTemplate> {
	const { data } = await sharp(source)
		.ensureAlpha()
		.resize(TEMPLATE_SIZE, TEMPLATE_SIZE, {
			fit: "contain",
			background: { r: 0, g: 0, b: 0, alpha: 0 },
		})
		.raw()
		.toBuffer({ resolveWithObject: true });

	const pixelCount = TEMPLATE_SIZE * TEMPLATE_SIZE;
	const dxList: number[] = [];
	const dyList: number[] = [];
	const weightList: number[] = [];
	const luminanceList: number[] = [];

	let weightSum = 0;
	let weightedR = 0;
	let weightedG = 0;
	let weightedB = 0;
	let weightedLum = 0;

	for (let i = 0; i < pixelCount; i += 1) {
		const pi = i * 4;
		const alpha = (data[pi + 3] ?? 0) / 255;
		if (alpha <= 0) {
			continue;
		}

		const r = data[pi] ?? 0;
		const g = data[pi + 1] ?? 0;
		const b = data[pi + 2] ?? 0;
		const lum = rgbToLuminance(r, g, b);

		const y = (i / TEMPLATE_SIZE) | 0;
		const x = i - y * TEMPLATE_SIZE;

		dxList.push(x);
		dyList.push(y);
		weightList.push(alpha);
		luminanceList.push(lum);

		weightSum += alpha;
		weightedR += alpha * r;
		weightedG += alpha * g;
		weightedB += alpha * b;
		weightedLum += alpha * lum;
	}

	const activeCount = weightList.length;
	const meanLum = weightSum > 0 ? weightedLum / weightSum : 0;

	const dx = Int16Array.from(dxList);
	const dy = Int16Array.from(dyList);
	const weights = Float32Array.from(weightList);
	const luminanceDeviations = new Float32Array(activeCount);

	let luminanceVariance = 0;
	for (let k = 0; k < activeCount; k += 1) {
		const deviation = (luminanceList[k] ?? 0) - meanLum;
		const weight = weights[k] ?? 0;
		luminanceDeviations[k] = weight * deviation;
		luminanceVariance += weight * deviation * deviation;
	}

	return {
		name: fileName,
		activeCount,
		dx,
		dy,
		weights,
		luminanceDeviations,
		luminanceStdDev: Math.sqrt(luminanceVariance),
		weightSum,
		meanR: weightSum > 0 ? weightedR / weightSum : 0,
		meanG: weightSum > 0 ? weightedG / weightSum : 0,
		meanB: weightSum > 0 ? weightedB / weightSum : 0,
	};
}

async function frameContainsEyes(
	frameBuffer: Buffer,
	templates: EyeTemplate[],
): Promise<Omit<EyeMatch, "frameIndex"> | null> {
	const baseBuffer = await sharp(frameBuffer)
		.ensureAlpha()
		.flatten({ background: { r: 255, g: 255, b: 255 } })
		.toBuffer();

	const scaledPromises = FRAME_SCALES.map((targetSize) => {
		const promise = sharp(baseBuffer)
			.resize({
				width: targetSize,
				height: targetSize,
				fit: "inside",
				withoutEnlargement: false,
			})
			.raw()
			.toBuffer({ resolveWithObject: true });
		promise.catch(() => {});
		return promise;
	});

	let bestMatch: Omit<EyeMatch, "frameIndex"> | null = null;

	for (let i = 0; i < scaledPromises.length; i += 1) {
		const scaled = await scaledPromises[i]!;
		const { data, info } = scaled;
		if (info.width < TEMPLATE_SIZE || info.height < TEMPLATE_SIZE) {
			continue;
		}

		const match = scanFrameAtScale(
			data,
			info.width,
			info.height,
			info.channels,
			templates,
		);

		if (
			match &&
			(!bestMatch || match.correlation > bestMatch.correlation)
		) {
			bestMatch = match;
			if (bestMatch.correlation >= EARLY_EXIT_CORRELATION) {
				return bestMatch;
			}
		}
	}

	return bestMatch;
}

function scanFrameAtScale(
	pixels: Buffer,
	width: number,
	height: number,
	channels: number,
	templates: EyeTemplate[],
): Omit<EyeMatch, "frameIndex"> | null {
	const pixelCount = width * height;
	const frameLum = new Float32Array(pixelCount);
	for (let i = 0; i < pixelCount; i += 1) {
		const pi = i * channels;
		frameLum[i] = rgbToLuminance(
			pixels[pi]!,
			pixels[pi + 1]!,
			pixels[pi + 2]!,
		);
	}

	const templateOffsets = templates.map((template) => {
		const offsets = new Int32Array(template.activeCount);
		const { dx, dy, activeCount } = template;
		for (let k = 0; k < activeCount; k += 1) {
			offsets[k] = dy[k]! * width + dx[k]!;
		}
		return offsets;
	});

	let best: Omit<EyeMatch, "frameIndex"> | null = null;
	const maxY = height - TEMPLATE_SIZE;
	const maxX = width - TEMPLATE_SIZE;

	for (let y = 0; y <= maxY; y += WINDOW_STRIDE) {
		const rowBase = y * width;
		for (let x = 0; x <= maxX; x += WINDOW_STRIDE) {
			const baseIndex = rowBase + x;
			for (let t = 0; t < templates.length; t += 1) {
				const template = templates[t]!;
				const offsets = templateOffsets[t]!;
				const correlation = computeMaskedZncc(
					frameLum,
					baseIndex,
					template,
					offsets,
				);
				if (correlation < WEAK_CORRELATION) {
					continue;
				}

				const colorDistance = computeMeanColorDistance(
					pixels,
					channels,
					baseIndex,
					template,
					offsets,
				);

				const strongMatch =
					correlation >= EYES_DETECTION_THRESHOLD &&
					colorDistance <= MAX_COLOR_DISTANCE;
				const weakMatch =
					correlation >= WEAK_CORRELATION &&
					colorDistance <= MAX_COLOR_DISTANCE_STRICT;
				if (!strongMatch && !weakMatch) {
					continue;
				}

				if (!best || correlation > best.correlation) {
					best = {
						templateName: template.name,
						correlation,
						score: correlation,
						colorDistance,
					};
				}
			}
		}
	}

	return best;
}

function computeMaskedZncc(
	frameLum: Float32Array,
	baseIndex: number,
	template: EyeTemplate,
	offsets: Int32Array,
): number {
	const {
		activeCount,
		weights,
		luminanceDeviations,
		luminanceStdDev,
		weightSum,
	} = template;

	if (luminanceStdDev <= 0 || weightSum <= 0) {
		return 0;
	}

	let sumMF = 0;
	let sumMFF = 0;
	let sumDevF = 0;

	for (let k = 0; k < activeCount; k += 1) {
		const f = frameLum[baseIndex + offsets[k]!]!;
		const w = weights[k]!;
		sumMF += w * f;
		sumMFF += w * f * f;
		sumDevF += luminanceDeviations[k]! * f;
	}

	const varF = sumMFF - (sumMF * sumMF) / weightSum;
	if (varF <= MIN_FRAME_VARIANCE) {
		return 0;
	}

	const denominator = luminanceStdDev * Math.sqrt(varF);
	if (denominator <= 0) {
		return 0;
	}
	const correlation = sumDevF / denominator;
	return correlation < -1 ? -1 : correlation > 1 ? 1 : correlation;
}

function computeMeanColorDistance(
	framePixels: Buffer,
	channels: number,
	baseIndex: number,
	template: EyeTemplate,
	offsets: Int32Array,
): number {
	const { activeCount, weights, weightSum, meanR, meanG, meanB } = template;

	let rSum = 0;
	let gSum = 0;
	let bSum = 0;

	for (let k = 0; k < activeCount; k += 1) {
		const fi = (baseIndex + offsets[k]!) * channels;
		const w = weights[k]!;
		rSum += w * framePixels[fi]!;
		gSum += w * framePixels[fi + 1]!;
		bSum += w * framePixels[fi + 2]!;
	}

	const dr = rSum / weightSum - meanR;
	const dg = gSum / weightSum - meanG;
	const db = bSum / weightSum - meanB;
	return Math.sqrt(dr * dr + dg * dg + db * db);
}

function rgbToLuminance(r: number, g: number, b: number): number {
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
