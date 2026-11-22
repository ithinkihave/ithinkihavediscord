// Trains the HOG + logistic-regression proposal model for the eyes detector.
//
//   node --import tsx/esm scripts/eyes-hog/train.ts <backgroundDir...>
//
// Positives: reference templates composited onto random background crops with
// scale/rotation/colour/blur/JPEG/occlusion augmentation. Negatives: random windows
// from the backgrounds at the detector's scale ladder, plus mined hard negatives.
// Writes lib/eyeCheck/hogModel.json. Never train on tests/fixtures (held-out eval).
import sharp from "sharp";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	HOG_BINS,
	HOG_CELL,
	HOG_FEATURE_LENGTH,
	HOG_WINDOW_CELLS,
	computeHog,
	extractWindowFeatures,
	luminancePlane,
	modelFromVector,
	scoreWindows,
} from "../../lib/eyeCheck/hog.ts";

const TEMPLATE_DIR = path.resolve("img/reference-eyes");
const OUTPUT = path.resolve("lib/eyeCheck/hogModel.json");
const LADDER = [720, 540, 405, 304, 228, 171, 128, 96, 72, 54];
const WINDOW = HOG_WINDOW_CELLS * HOG_CELL; // 32
const MARGIN = 2 * HOG_CELL; // 8px of context around the window
const PATCH = WINDOW + 2 * MARGIN; // 48
const SUPER = 3; // composite at 3x then downscale, like real media being resized

const backgroundDirs = process.argv.slice(2);
if (backgroundDirs.length === 0) {
	throw new Error("usage: train.ts <backgroundDir...>");
}

function mulberry32(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const rand = mulberry32(0xc0ffee);
const uniform = (lo: number, hi: number) => lo + (hi - lo) * rand();
const pick = <T>(items: T[]): T => items[Math.floor(rand() * items.length)]!;

async function listImages(dir: string): Promise<string[]> {
	const out: string[] = [];
	for (const entry of await readdir(dir, {
		withFileTypes: true,
		recursive: true,
	})) {
		if (entry.isFile() && /\.(jpe?g|png|webp)$/i.test(entry.name)) {
			out.push(path.join(entry.parentPath, entry.name));
		}
	}
	return out.sort();
}

type Background = { data: Buffer; width: number; height: number };

async function loadBackground(file: string): Promise<Background | null> {
	try {
		const { data, info } = await sharp(file)
			.flatten({ background: "#ffffff" })
			.resize(640, 640, { fit: "inside" })
			.removeAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true });
		return { data, width: info.width, height: info.height };
	} catch {
		return null;
	}
}

function backgroundRaw(bg: Background) {
	return {
		raw: { width: bg.width, height: bg.height, channels: 3 as const },
	};
}

async function randomBackgroundPatch(
	bg: Background,
	size: number,
): Promise<Buffer> {
	const mode = rand();
	if (mode < 0.08) {
		const shade = rand() < 0.5 ? uniform(225, 255) : uniform(0, 60);
		return sharp({
			create: {
				width: size,
				height: size,
				channels: 3,
				background: { r: shade, g: shade, b: shade },
			},
		})
			.png()
			.toBuffer();
	}
	if (mode < 0.14) {
		return sharp({
			create: {
				width: size,
				height: size,
				channels: 3,
				background: {
					r: uniform(0, 255),
					g: uniform(0, 255),
					b: uniform(0, 255),
				},
			},
		})
			.png()
			.toBuffer();
	}
	const minSide = Math.min(bg.width, bg.height);
	const crop = Math.max(24, Math.floor(minSide * uniform(0.12, 1)));
	const left = Math.floor(rand() * (bg.width - crop + 1));
	const top = Math.floor(rand() * (bg.height - crop + 1));
	return sharp(bg.data, backgroundRaw(bg))
		.extract({ left, top, width: crop, height: crop })
		.resize(size, size)
		.png()
		.toBuffer();
}

async function renderPositive(
	template: Buffer,
	bg: Background,
	scaleJitter: [number, number],
	jitterPx: number,
): Promise<Float32Array> {
	const canvas = PATCH * SUPER;
	const box = Math.round(WINDOW * uniform(...scaleJitter) * SUPER);
	let emoji = sharp(template).resize(box, box, {
		fit: "contain",
		background: { r: 0, g: 0, b: 0, alpha: 0 },
	});
	if (rand() < 0.5) {
		emoji = emoji.modulate({
			brightness: uniform(0.8, 1.12),
			saturation: uniform(0.6, 1.3),
			hue: rand() < 0.2 ? Math.round(uniform(-25, 25)) : 0,
		});
	}
	let emojiBuffer = await emoji.png().toBuffer();
	if (rand() < 0.4) {
		emojiBuffer = await sharp(emojiBuffer)
			.rotate(uniform(-15, 15), {
				background: { r: 0, g: 0, b: 0, alpha: 0 },
			})
			.png()
			.toBuffer();
	}
	const meta = await sharp(emojiBuffer).metadata();
	const ew = meta.width!;
	const eh = meta.height!;
	// oversized (wrong-scale) emoji get a bigger canvas, cropped back to the patch below
	const stage = Math.max(canvas, ew + 2 * SUPER * 3, eh + 2 * SUPER * 3);
	const cx = stage / 2 + uniform(-jitterPx, jitterPx) * SUPER;
	const cy = stage / 2 + uniform(-jitterPx, jitterPx) * SUPER;
	const composites: sharp.OverlayOptions[] = [
		{
			input: emojiBuffer,
			left: Math.round(cx - ew / 2),
			top: Math.round(cy - eh / 2),
		},
	];
	if (rand() < 0.15) {
		const ow = Math.round(box * uniform(0.15, 0.45));
		const oh = Math.round(box * uniform(0.15, 0.45));
		composites.push({
			input: {
				create: {
					width: ow,
					height: oh,
					channels: 4,
					background: {
						r: uniform(0, 255),
						g: uniform(0, 255),
						b: uniform(0, 255),
						alpha: 1,
					},
				},
			},
			left: Math.round(cx - box / 2 + rand() * (box - ow)),
			top: Math.round(cy - box / 2 + rand() * (box - oh)),
		});
	}
	const base = await randomBackgroundPatch(bg, stage);
	const offset = Math.floor((stage - canvas) / 2);
	let pipeline = sharp(
		await sharp(
			await sharp(base)
				.composite(composites)
				.removeAlpha()
				.png()
				.toBuffer(),
		)
			.extract({
				left: offset,
				top: offset,
				width: canvas,
				height: canvas,
			})
			.png()
			.toBuffer(),
	).resize(PATCH, PATCH);
	if (rand() < 0.25) {
		pipeline = pipeline.blur(uniform(0.3, 1.1));
	}
	let patch = await pipeline.png().toBuffer();
	if (rand() < 0.7) {
		patch = await sharp(patch)
			.jpeg({ quality: Math.round(uniform(30, 95)) })
			.toBuffer();
	}
	const { data, info } = await sharp(patch)
		.removeAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	const lum = luminancePlane(data, info.width, info.height, info.channels);
	const map = computeHog(lum, info.width, info.height);
	return extractWindowFeatures(map, MARGIN / HOG_CELL, MARGIN / HOG_CELL);
}

async function backgroundScaleMaps(bg: Background, longest: number) {
	const { data, info } = await sharp(bg.data, backgroundRaw(bg))
		.resize({ width: longest, height: longest, fit: "inside" })
		.raw()
		.toBuffer({ resolveWithObject: true });
	const lum = luminancePlane(data, info.width, info.height, info.channels);
	return computeHog(lum, info.width, info.height);
}

async function randomNegatives(bgs: Background[], perImage: number) {
	const out: Float32Array[] = [];
	for (const bg of bgs) {
		for (let n = 0; n < perImage; n += 1) {
			const map = await backgroundScaleMaps(bg, pick(LADDER));
			const wide = map.cellsWide - HOG_WINDOW_CELLS + 1;
			const high = map.cellsHigh - HOG_WINDOW_CELLS + 1;
			if (wide <= 0 || high <= 0) {
				continue;
			}
			for (let k = 0; k < 8; k += 1) {
				out.push(
					extractWindowFeatures(
						map,
						Math.floor(rand() * wide),
						Math.floor(rand() * high),
					),
				);
			}
		}
	}
	return out;
}

async function mineHardNegatives(
	bgs: Background[],
	weights: Float32Array,
	bias: number,
	threshold: number,
	limit: number,
) {
	const model = modelFromVector(weights, bias);
	const hard: { score: number; feature: Float32Array }[] = [];
	for (const bg of bgs) {
		for (const longest of LADDER) {
			const map = await backgroundScaleMaps(bg, longest);
			const { scores, positionsWide } = scoreWindows(map, model);
			for (let i = 0; i < scores.length; i += 1) {
				if (scores[i]! > threshold) {
					hard.push({
						score: scores[i]!,
						feature: extractWindowFeatures(
							map,
							i % positionsWide,
							Math.floor(i / positionsWide),
						),
					});
				}
			}
		}
	}
	hard.sort((a, b) => b.score - a.score);
	return hard.slice(0, limit).map((h) => h.feature);
}

function train(
	positives: Float32Array[],
	negatives: Float32Array[],
	epochs: number,
	l2: number,
): { weights: Float32Array; bias: number } {
	const dims = HOG_FEATURE_LENGTH;
	const samples = [
		...positives.map((x) => ({ x, y: 1 })),
		...negatives.map((x) => ({ x, y: 0 })),
	];
	const positiveWeight = negatives.length / Math.max(1, positives.length);
	const w = new Float64Array(dims);
	let b = 0;
	const m = new Float64Array(dims + 1);
	const v = new Float64Array(dims + 1);
	const grad = new Float64Array(dims + 1);
	const lr = 0.01;
	const beta1 = 0.9;
	const beta2 = 0.999;
	const batch = 256;
	let step = 0;
	for (let epoch = 0; epoch < epochs; epoch += 1) {
		for (let i = samples.length - 1; i > 0; i -= 1) {
			const j = Math.floor(rand() * (i + 1));
			[samples[i], samples[j]] = [samples[j]!, samples[i]!];
		}
		let loss = 0;
		for (let start = 0; start < samples.length; start += batch) {
			grad.fill(0);
			let batchWeight = 0;
			const end = Math.min(samples.length, start + batch);
			for (let s = start; s < end; s += 1) {
				const { x, y } = samples[s]!;
				let z = b;
				for (let d = 0; d < dims; d += 1) {
					z += w[d]! * x[d]!;
				}
				const p = 1 / (1 + Math.exp(-z));
				const sw = y === 1 ? positiveWeight : 1;
				batchWeight += sw;
				loss +=
					sw *
					(y === 1 ? -Math.log(p + 1e-12) : -Math.log(1 - p + 1e-12));
				const g = sw * (p - y);
				for (let d = 0; d < dims; d += 1) {
					grad[d]! += g * x[d]!;
				}
				grad[dims]! += g;
			}
			step += 1;
			for (let d = 0; d <= dims; d += 1) {
				let g = grad[d]! / batchWeight;
				if (d < dims) {
					g += l2 * w[d]!;
				}
				m[d] = beta1 * m[d]! + (1 - beta1) * g;
				v[d] = beta2 * v[d]! + (1 - beta2) * g * g;
				const mh = m[d]! / (1 - beta1 ** step);
				const vh = v[d]! / (1 - beta2 ** step);
				const delta = (lr * mh) / (Math.sqrt(vh) + 1e-8);
				if (d < dims) {
					w[d]! -= delta;
				} else {
					b -= delta;
				}
			}
		}
		if (epoch % 5 === 4 || epoch === epochs - 1) {
			console.log(
				`  epoch ${epoch + 1} loss=${(loss / samples.length).toFixed(4)}`,
			);
		}
	}
	return { weights: Float32Array.from(w), bias: b };
}

function dot(weights: Float32Array, bias: number, x: Float32Array) {
	let z = bias;
	for (let d = 0; d < weights.length; d += 1) {
		z += weights[d]! * x[d]!;
	}
	return z;
}

function quantile(values: number[], q: number) {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
}

async function main() {
	const templateFiles = (await readdir(TEMPLATE_DIR))
		.filter((f) => f.endsWith(".png"))
		.sort();
	const templates = await Promise.all(
		templateFiles.map((f) => readFile(path.join(TEMPLATE_DIR, f))),
	);

	const bgFiles = (await Promise.all(backgroundDirs.map(listImages))).flat();
	for (let i = bgFiles.length - 1; i > 0; i -= 1) {
		const j = Math.floor(rand() * (i + 1));
		[bgFiles[i], bgFiles[j]] = [bgFiles[j]!, bgFiles[i]!];
	}
	const loaded = (await Promise.all(bgFiles.map(loadBackground))).filter(
		(b): b is Background => b !== null,
	);
	const split = Math.floor(loaded.length * 0.8);
	const trainBgs = loaded.slice(0, split);
	const valBgs = loaded.slice(split);
	console.log(`backgrounds train=${trainBgs.length} val=${valBgs.length}`);

	const makePositives = async (
		count: number,
		bgs: Background[],
		scaleJitter: [number, number],
		jitter: number,
	) => {
		const out: Float32Array[] = [];
		const tasks = Array.from({ length: count }, (_, i) => i);
		const concurrency = 6;
		let next = 0;
		await Promise.all(
			Array.from({ length: concurrency }, async () => {
				while (next < tasks.length) {
					const i = next++;
					out.push(
						await renderPositive(
							templates[i % templates.length]!,
							pick(bgs),
							scaleJitter,
							jitter,
						),
					);
				}
			}),
		);
		return out;
	};

	console.time("positives");
	const trainPos = await makePositives(
		templates.length * 140,
		trainBgs,
		[0.85, 1.17],
		2,
	);
	const valPos = await makePositives(
		templates.length * 25,
		valBgs,
		[0.85, 1.17],
		2,
	);
	// windows whose emoji is clearly at another ladder level, or off-centre:
	// teaching the model to reject them keeps peaks sharp for top-K selection
	const wrongScale = [
		...(await makePositives(
			templates.length * 10,
			trainBgs,
			[0.42, 0.6],
			2,
		)),
		...(await makePositives(
			templates.length * 6,
			trainBgs,
			[1.75, 2.3],
			2,
		)),
	];
	console.timeEnd("positives");

	console.time("negatives");
	let trainNeg = [...(await randomNegatives(trainBgs, 6)), ...wrongScale];
	const valNeg = await randomNegatives(valBgs, 6);
	console.timeEnd("negatives");
	console.log(
		`train pos=${trainPos.length} neg=${trainNeg.length}; val pos=${valPos.length} neg=${valNeg.length}`,
	);

	let model = train(trainPos, trainNeg, 25, 1e-4);
	for (let round = 0; round < 2; round += 1) {
		console.time(`mining round ${round + 1}`);
		const posScores = trainPos.map((x) =>
			dot(model.weights, model.bias, x),
		);
		const threshold = quantile(posScores, 0.01);
		const hard = await mineHardNegatives(
			trainBgs,
			model.weights,
			model.bias,
			threshold,
			15000,
		);
		console.timeEnd(`mining round ${round + 1}`);
		console.log(
			`  mined ${hard.length} hard negatives above ${threshold.toFixed(2)}`,
		);
		trainNeg = [...trainNeg, ...hard];
		model = train(trainPos, trainNeg, 25, 1e-4);
	}

	const valPosScores = valPos.map((x) => dot(model.weights, model.bias, x));
	const valNegScores = valNeg.map((x) => dot(model.weights, model.bias, x));
	for (const recall of [0.95, 0.98, 0.99, 0.995]) {
		const threshold = quantile(valPosScores, 1 - recall);
		const fpr =
			valNegScores.filter((s) => s >= threshold).length /
			valNegScores.length;
		console.log(
			`val recall ${recall} -> threshold ${threshold.toFixed(3)} negative window pass rate ${(fpr * 100).toFixed(3)}%`,
		);
	}
	const perTemplate = templateFiles.map((name, t) => {
		const scores = valPos
			.filter((_, i) => i % templates.length === t)
			.map((x) => dot(model.weights, model.bias, x));
		return {
			name,
			min: Math.min(...scores),
			median: quantile(scores, 0.5),
		};
	});
	perTemplate.sort((a, b) => a.median - b.median);
	console.log(
		"weakest templates (median val score):",
		perTemplate
			.slice(0, 8)
			.map((t) => `${t.name.slice(11, 14)}=${t.median.toFixed(2)}`)
			.join(" "),
	);

	await writeFile(
		OUTPUT,
		JSON.stringify({
			bins: HOG_BINS,
			cell: HOG_CELL,
			windowCells: HOG_WINDOW_CELLS,
			bias: Number(model.bias.toFixed(5)),
			weights: Array.from(model.weights, (w) => Number(w.toFixed(5))),
		}) + "\n",
	);
	console.log(`wrote ${OUTPUT}`);
}

await main();
