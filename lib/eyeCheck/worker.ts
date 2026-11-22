import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { type DecodedMedia, type RgbFrame, decodeMedia } from "./decode.ts";
import {
	type DetectionTask,
	type EyeMatch,
	type MediaKind,
	EYES_DETECTION_THRESHOLD,
	MAX_VIDEO_FRAMES,
} from "./types.ts";
import { MAX_NEIGHBOURHOOD, NeighbourhoodScanner } from "./wasmVerify.ts";
import {
	HOG_CELL,
	type HogModel,
	computeHog,
	luminancePlane,
	modelFromVector,
	rgbToLuminance,
	scoreWindows,
} from "./hog.ts";

const REFERENCE_EYES_DIR = path.resolve("img/reference-eyes");
const HOG_MODEL_PATH = new URL("./hogModel.json", import.meta.url);

const TEMPLATE_SIZE = 32;
// Longest-side sizes to scan at. With a 32px template these find an emoji
// spanning roughly 4% (720) to 45% (72) of the frame.
const FRAME_SCALES = [720, 540, 405, 304, 228, 171, 128, 96, 72];
// Upscaling adds no detail, so skip scales well above the decoded frame (a
// 240px gif no longer gets blown up to 720). 1.5 still covers emoji down to
// about 9% of a small frame.
const MAX_UPSCALE = 1.5;
const MAX_COLOR_DISTANCE = 55;
const WEAK_CORRELATION = 0.75;
const MAX_COLOR_DISTANCE_STRICT = 25;
const MIN_FRAME_VARIANCE = 25;

// Cascade: a HOG + linear model (hogModel.json, scripts/eyes-hog/train.ts)
// proposes windows, then masked ZNCC + colour gates check every pixel within
// VERIFY_RADIUS of the top proposals. The proposal threshold gives ~99.5%
// recall on synthetic validation composites.
const PROPOSAL_THRESHOLD = -1.7;
const MAX_PROPOSALS = 40;
const VERIFY_RADIUS = 4;
// Checking every pixel near a peak finds higher correlations than a stride-3
// scan would, for real eyes and look-alikes alike, so the proposal model also
// gets a vote: corr + HOG_VOTE * proposal logit must reach COMBINED_THRESHOLD.
// That vetoes skull/ghost-like look-alikes without losing weak real eyes.
const HOG_VOTE = 0.02;
const COMBINED_THRESHOLD = 0.83;
// The SIMD pre-pass accumulates in f32, so it uses a slightly lower bar and
// every candidate is re-scored in f64: decisions match the plain JS path.
const WASM_CANDIDATE_MARGIN = 0.005;

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
const hogModelPromise = loadHogModel();
const scannerPromise = eyeTemplatesPromise
	.then((templates) => new NeighbourhoodScanner(templates))
	.catch((error: unknown) => {
		// slower, but the same answers
		console.error("[bot] eyes WASM kernel unavailable, using JS", error);
		return null;
	});
if (VERIFY_RADIUS * 2 + 1 > MAX_NEIGHBOURHOOD) {
	throw new Error(`VERIFY_RADIUS ${VERIFY_RADIUS} is too large`);
}

async function loadHogModel(): Promise<HogModel> {
	const raw = JSON.parse(await readFile(HOG_MODEL_PATH, "utf8")) as {
		weights: number[];
		bias: number;
	};
	return modelFromVector(raw.weights, raw.bias);
}

export default async function detectEyesTask(
	task: DetectionTask,
): Promise<EyeMatch | null> {
	const templates = await eyeTemplatesPromise;
	await hogModelPromise;
	const match = await detectEyesInMediaBytes(
		task.bytes,
		task.mediaKind,
		task.sourceLabel,
		templates,
	);
	if (match && !task.includeFrame) {
		delete match.frame;
	}
	return match;
}

type FrameMatch = Pick<
	EyeMatch,
	"templateName" | "score" | "correlation" | "colorDistance"
>;

// a match plus where it was found, in the pyramid level's pixels
type LocatedMatch = FrameMatch & {
	x: number;
	y: number;
	levelWidth: number;
	levelHeight: number;
};

async function detectEyesInMediaBytes(
	bytes: Buffer,
	mediaKind: MediaKind,
	sourceLabel: string,
	templates: EyeTemplate[],
): Promise<EyeMatch | null> {
	const media = await decodeMedia(
		bytes,
		mediaKind,
		sourceLabel,
		MAX_VIDEO_FRAMES,
	);
	let frameIndex = 0;
	let result: EyeMatch | null = null;

	// frames stream in from ffmpeg; breaking out early stops the decode
	for await (const frame of media.frames) {
		const hit = await frameContainsEyes(frame, templates);
		if (hit) {
			result = toEyeMatch(hit, frame, frameIndex, media);
			break;
		}
		frameIndex += 1;
	}
	return result;
}

function toEyeMatch(
	hit: LocatedMatch,
	frame: RgbFrame,
	frameIndex: number,
	media: DecodedMedia,
): EyeMatch {
	const sourceWidth = media.sourceWidth || frame.width;
	const sourceHeight = media.sourceHeight || frame.height;
	const scaleX = sourceWidth / hit.levelWidth;
	const scaleY = sourceHeight / hit.levelHeight;
	const { x, y, levelWidth, levelHeight, ...match } = hit;
	void levelWidth;
	void levelHeight;

	return {
		...match,
		frameIndex,
		frame,
		bbox: {
			x: Math.round(x * scaleX),
			y: Math.round(y * scaleY),
			size: Math.round((TEMPLATE_SIZE * (scaleX + scaleY)) / 2),
		},
		sourceWidth,
		sourceHeight,
	};
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
	frame: RgbFrame,
	templates: EyeTemplate[],
): Promise<LocatedMatch | null> {
	const levels = await buildPyramid(frame);
	const model = await hogModelPromise;
	const scanner = await scannerPromise;

	const proposals: Proposal[] = [];
	levels.forEach((level, levelIndex) =>
		collectProposals(level, levelIndex, model, proposals),
	);
	proposals.sort((a, b) => b.score - a.score);

	for (const proposal of proposals.slice(0, MAX_PROPOSALS)) {
		const level = levels[proposal.level]!;
		const match = verifyAround(
			level,
			proposal.x,
			proposal.y,
			templates,
			scanner,
		);
		if (
			match &&
			match.correlation + HOG_VOTE * proposal.score >= COMBINED_THRESHOLD
		) {
			return match;
		}
	}
	return null;
}

/**
 * Every scan size that fits the frame's upscale budget, each as RGB plus a
 * luminance plane. Levels smaller than a template are useless and dropped.
 */
async function buildPyramid(frame: RgbFrame): Promise<ScaledLevel[]> {
	const longest = Math.max(frame.width, frame.height);
	let scales = FRAME_SCALES.filter((size) => size <= longest * MAX_UPSCALE);
	if (scales.length === 0) {
		scales = [Math.min(...FRAME_SCALES)];
	}

	const resized = await Promise.all(
		scales.map((size) => resizeWithSharp(frame, size)),
	);

	return resized
		.filter(
			(level) =>
				level.width >= TEMPLATE_SIZE && level.height >= TEMPLATE_SIZE,
		)
		.map((level) => ({
			...level,
			channels: 3,
			lum: luminancePlane(level.rgb, level.width, level.height, 3),
			offsets: null,
		}));
}

async function resizeWithSharp(
	frame: RgbFrame,
	size: number,
): Promise<RgbFrame> {
	const { data, info } = await sharp(frame.rgb, {
		raw: { width: frame.width, height: frame.height, channels: 3 },
	})
		.resize({ width: size, height: size, fit: "inside" })
		.raw()
		.toBuffer({ resolveWithObject: true });
	return { width: info.width, height: info.height, rgb: data };
}

type ScaledLevel = {
	rgb: Buffer;
	width: number;
	height: number;
	channels: number;
	lum: Float32Array;
	offsets: Int32Array[] | null;
};

type Proposal = { score: number; level: number; x: number; y: number };

function collectProposals(
	level: ScaledLevel,
	levelIndex: number,
	model: HogModel,
	out: Proposal[],
) {
	const map = computeHog(level.lum, level.width, level.height);
	const { scores, positionsWide, positionsHigh } = scoreWindows(map, model);
	for (let cy = 0; cy < positionsHigh; cy += 1) {
		for (let cx = 0; cx < positionsWide; cx += 1) {
			const score = scores[cy * positionsWide + cx]!;
			if (score < PROPOSAL_THRESHOLD) {
				continue;
			}
			// 3x3 non-maximum suppression on the cell grid
			let isPeak = true;
			for (let dy = -1; dy <= 1 && isPeak; dy += 1) {
				const ny = cy + dy;
				if (ny < 0 || ny >= positionsHigh) continue;
				for (let dx = -1; dx <= 1; dx += 1) {
					const nx = cx + dx;
					if ((dx === 0 && dy === 0) || nx < 0 || nx >= positionsWide)
						continue;
					const neighbour = scores[ny * positionsWide + nx]!;
					if (
						neighbour > score ||
						(neighbour === score &&
							(dy < 0 || (dy === 0 && dx < 0)))
					) {
						isPeak = false;
						break;
					}
				}
			}
			if (isPeak) {
				out.push({
					score,
					level: levelIndex,
					x: cx * HOG_CELL,
					y: cy * HOG_CELL,
				});
			}
		}
	}
}

function verifyAround(
	level: ScaledLevel,
	centerX: number,
	centerY: number,
	templates: EyeTemplate[],
	scanner: NeighbourhoodScanner | null,
): LocatedMatch | null {
	const minX = Math.max(0, centerX - VERIFY_RADIUS);
	const maxX = Math.min(level.width - TEMPLATE_SIZE, centerX + VERIFY_RADIUS);
	const minY = Math.max(0, centerY - VERIFY_RADIUS);
	const maxY = Math.min(
		level.height - TEMPLATE_SIZE,
		centerY + VERIFY_RADIUS,
	);
	if (!scanner) {
		return bestMatchInRange(level, templates, minX, maxX, minY, maxY);
	}

	const { width, height, channels, rgb, lum } = level;
	if (!level.offsets) {
		level.offsets = templateOffsetsFor(templates, width);
	}
	const offsets = level.offsets;
	let best: LocatedMatch | null = null;
	scanner.scan(
		lum,
		width,
		minX,
		maxX,
		minY,
		maxY,
		MIN_FRAME_VARIANCE,
		WEAK_CORRELATION - WASM_CANDIDATE_MARGIN,
		(t, x, y) => {
			const match = matchTemplateAt(
				rgb,
				lum,
				channels,
				y * width + x,
				templates[t]!,
				offsets[t]!,
			);
			if (match && (!best || match.correlation > best.correlation)) {
				best = {
					...match,
					x,
					y,
					levelWidth: width,
					levelHeight: height,
				};
			}
		},
	);
	return best;
}

function bestMatchInRange(
	level: ScaledLevel,
	templates: EyeTemplate[],
	minX: number,
	maxX: number,
	minY: number,
	maxY: number,
): LocatedMatch | null {
	const { width, height, channels, rgb, lum } = level;
	if (!level.offsets) {
		level.offsets = templateOffsetsFor(templates, width);
	}
	const offsets = level.offsets;

	let best: LocatedMatch | null = null;
	for (let y = minY; y <= maxY; y += 1) {
		for (let x = minX; x <= maxX; x += 1) {
			const match = evaluateWindow(
				rgb,
				lum,
				channels,
				y * width + x,
				templates,
				offsets,
			);
			if (match && (!best || match.correlation > best.correlation)) {
				best = {
					...match,
					x,
					y,
					levelWidth: width,
					levelHeight: height,
				};
			}
		}
	}
	return best;
}

function templateOffsetsFor(templates: EyeTemplate[], width: number) {
	return templates.map((template) => {
		const offsets = new Int32Array(template.activeCount);
		const { dx, dy, activeCount } = template;
		for (let k = 0; k < activeCount; k += 1) {
			offsets[k] = dy[k]! * width + dx[k]!;
		}
		return offsets;
	});
}

function evaluateWindow(
	pixels: Buffer,
	frameLum: Float32Array,
	channels: number,
	baseIndex: number,
	templates: EyeTemplate[],
	templateOffsets: Int32Array[],
): FrameMatch | null {
	let best: FrameMatch | null = null;
	for (let t = 0; t < templates.length; t += 1) {
		const match = matchTemplateAt(
			pixels,
			frameLum,
			channels,
			baseIndex,
			templates[t]!,
			templateOffsets[t]!,
		);
		if (match && (!best || match.correlation > best.correlation)) {
			best = match;
		}
	}
	return best;
}

/** Masked ZNCC plus the colour gates for one template at one window. */
function matchTemplateAt(
	pixels: Buffer,
	frameLum: Float32Array,
	channels: number,
	baseIndex: number,
	template: EyeTemplate,
	offsets: Int32Array,
): FrameMatch | null {
	const correlation = computeMaskedZncc(
		frameLum,
		baseIndex,
		template,
		offsets,
	);
	if (correlation < WEAK_CORRELATION) {
		return null;
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
		return null;
	}

	return {
		templateName: template.name,
		correlation,
		score: correlation,
		colorDistance,
	};
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
