// HOG-style features used by the cheap proposal stage of the eyes detector.
// Shared by inference (worker.ts) and the training scripts so features match exactly.

export const HOG_CELL = 4;
export const HOG_BINS = 9;
export const HOG_WINDOW_CELLS = 8; // 8 cells * 4px = 32px window, same as the ZNCC template size
export const HOG_WINDOW_CELL_COUNT = HOG_WINDOW_CELLS * HOG_WINDOW_CELLS;
export const HOG_FEATURE_LENGTH =
	HOG_WINDOW_CELL_COUNT * HOG_BINS + HOG_WINDOW_CELL_COUNT + 2;

const ENERGY_EPSILON = HOG_WINDOW_CELL_COUNT * 10;
const LUMINANCE_STD_EPSILON = 2;

export type HogMap = {
	cellsWide: number;
	cellsHigh: number;
	// sqrt of magnitude-weighted orientation histograms, cell-major then bin
	hist: Float32Array;
	// per-cell sum of squared hist entries (= sum of gradient magnitudes)
	energy: Float32Array;
	// per-cell mean luminance
	lum: Float32Array;
};

export type HogModel = {
	histWeights: Float32Array; // HOG_WINDOW_CELL_COUNT * HOG_BINS
	lumWeights: Float32Array; // HOG_WINDOW_CELL_COUNT
	lumWeightSum: number;
	energyWeight: number;
	sigmaWeight: number;
	bias: number;
};

export function computeHog(
	lum: Float32Array,
	width: number,
	height: number,
): HogMap {
	const cellsWide = Math.floor(width / HOG_CELL);
	const cellsHigh = Math.floor(height / HOG_CELL);
	const hist = new Float32Array(cellsWide * cellsHigh * HOG_BINS);
	const energy = new Float32Array(cellsWide * cellsHigh);
	const cellLum = new Float32Array(cellsWide * cellsHigh);
	const usedWidth = cellsWide * HOG_CELL;
	const usedHeight = cellsHigh * HOG_CELL;
	const binScale = HOG_BINS / Math.PI;

	for (let y = 0; y < usedHeight; y += 1) {
		const row = y * width;
		const up = (y > 0 ? y - 1 : 0) * width;
		const down = (y < height - 1 ? y + 1 : height - 1) * width;
		const cellRow = (y >> 2) * cellsWide;
		for (let x = 0; x < usedWidth; x += 1) {
			const left = x > 0 ? x - 1 : 0;
			const right = x < width - 1 ? x + 1 : width - 1;
			const gx = lum[row + right]! - lum[row + left]!;
			const gy = lum[down + x]! - lum[up + x]!;
			const cell = cellRow + (x >> 2);
			cellLum[cell]! += lum[row + x]!;

			const magnitude = Math.sqrt(gx * gx + gy * gy);
			if (magnitude === 0) {
				continue;
			}
			let angle = Math.atan2(gy, gx);
			if (angle < 0) {
				angle += Math.PI;
			}
			let position = angle * binScale - 0.5;
			if (position < 0) {
				position += HOG_BINS;
			}
			const lowBin = Math.floor(position);
			const highWeight = position - lowBin;
			const base = cell * HOG_BINS;
			hist[base + (lowBin % HOG_BINS)]! += magnitude * (1 - highWeight);
			hist[base + ((lowBin + 1) % HOG_BINS)]! += magnitude * highWeight;
		}
	}

	const pixelsPerCell = HOG_CELL * HOG_CELL;
	for (let cell = 0; cell < cellsWide * cellsHigh; cell += 1) {
		cellLum[cell]! /= pixelsPerCell;
		let sum = 0;
		const base = cell * HOG_BINS;
		for (let b = 0; b < HOG_BINS; b += 1) {
			const value = hist[base + b]!;
			sum += value;
			hist[base + b] = Math.sqrt(value);
		}
		energy[cell] = sum;
	}

	return { cellsWide, cellsHigh, hist, energy, lum: cellLum };
}

type WindowStats = {
	energySum: number;
	lumMean: number;
	lumStd: number;
};

function windowStats(map: HogMap, cx: number, cy: number): WindowStats {
	let energySum = 0;
	let lumSum = 0;
	let lumSquareSum = 0;
	for (let j = 0; j < HOG_WINDOW_CELLS; j += 1) {
		const row = (cy + j) * map.cellsWide + cx;
		for (let i = 0; i < HOG_WINDOW_CELLS; i += 1) {
			energySum += map.energy[row + i]!;
			const l = map.lum[row + i]!;
			lumSum += l;
			lumSquareSum += l * l;
		}
	}
	const lumMean = lumSum / HOG_WINDOW_CELL_COUNT;
	const lumVariance = Math.max(
		0,
		lumSquareSum / HOG_WINDOW_CELL_COUNT - lumMean * lumMean,
	);
	return { energySum, lumMean, lumStd: Math.sqrt(lumVariance) };
}

// Full feature vector for one window (training + debugging). scoreWindow() is the
// fast equivalent of dot(model, extractWindowFeatures()).
export function extractWindowFeatures(
	map: HogMap,
	cx: number,
	cy: number,
	out = new Float32Array(HOG_FEATURE_LENGTH),
): Float32Array {
	const { energySum, lumMean, lumStd } = windowStats(map, cx, cy);
	const histNorm = 1 / Math.sqrt(energySum + ENERGY_EPSILON);
	const lumNorm = 1 / (lumStd + LUMINANCE_STD_EPSILON);
	let k = 0;
	for (let j = 0; j < HOG_WINDOW_CELLS; j += 1) {
		const row = (cy + j) * map.cellsWide + cx;
		for (let i = 0; i < HOG_WINDOW_CELLS; i += 1) {
			const base = (row + i) * HOG_BINS;
			for (let b = 0; b < HOG_BINS; b += 1) {
				out[k++] = map.hist[base + b]! * histNorm;
			}
		}
	}
	for (let j = 0; j < HOG_WINDOW_CELLS; j += 1) {
		const row = (cy + j) * map.cellsWide + cx;
		for (let i = 0; i < HOG_WINDOW_CELLS; i += 1) {
			out[k++] = (map.lum[row + i]! - lumMean) * lumNorm;
		}
	}
	out[k] = energyFeature(energySum);
	out[k + 1] = sigmaFeature(lumStd);
	return out;
}

function energyFeature(energySum: number): number {
	return Math.log1p(energySum / HOG_WINDOW_CELL_COUNT) / 5;
}

function sigmaFeature(lumStd: number): number {
	return Math.log1p(lumStd) / 4;
}

// Score every window position on the cell grid. Returns a Float32Array of
// (cellsWide - 7) * (cellsHigh - 7) logits, row-major.
export function scoreWindows(
	map: HogMap,
	model: HogModel,
): { scores: Float32Array; positionsWide: number; positionsHigh: number } {
	const positionsWide = map.cellsWide - HOG_WINDOW_CELLS + 1;
	const positionsHigh = map.cellsHigh - HOG_WINDOW_CELLS + 1;
	if (positionsWide <= 0 || positionsHigh <= 0) {
		return {
			scores: new Float32Array(0),
			positionsWide: 0,
			positionsHigh: 0,
		};
	}

	const { cellsWide, hist, energy, lum } = map;
	const { histWeights, lumWeights } = model;
	const scores = new Float32Array(positionsWide * positionsHigh);
	const windowRowLength = HOG_WINDOW_CELLS * HOG_BINS;

	for (let cy = 0; cy < positionsHigh; cy += 1) {
		for (let cx = 0; cx < positionsWide; cx += 1) {
			let histDot = 0;
			let lumDot = 0;
			let energySum = 0;
			let lumSum = 0;
			let lumSquareSum = 0;
			for (let j = 0; j < HOG_WINDOW_CELLS; j += 1) {
				const cellRow = (cy + j) * cellsWide + cx;
				const histBase = cellRow * HOG_BINS;
				const weightBase = j * windowRowLength;
				for (let k = 0; k < windowRowLength; k += 1) {
					histDot +=
						histWeights[weightBase + k]! * hist[histBase + k]!;
				}
				const lumWeightBase = j * HOG_WINDOW_CELLS;
				for (let i = 0; i < HOG_WINDOW_CELLS; i += 1) {
					const l = lum[cellRow + i]!;
					lumDot += lumWeights[lumWeightBase + i]! * l;
					lumSum += l;
					lumSquareSum += l * l;
					energySum += energy[cellRow + i]!;
				}
			}
			const lumMean = lumSum / HOG_WINDOW_CELL_COUNT;
			const lumStd = Math.sqrt(
				Math.max(
					0,
					lumSquareSum / HOG_WINDOW_CELL_COUNT - lumMean * lumMean,
				),
			);
			scores[cy * positionsWide + cx] =
				histDot / Math.sqrt(energySum + ENERGY_EPSILON) +
				(lumDot - lumMean * model.lumWeightSum) /
					(lumStd + LUMINANCE_STD_EPSILON) +
				model.energyWeight * energyFeature(energySum) +
				model.sigmaWeight * sigmaFeature(lumStd) +
				model.bias;
		}
	}

	return { scores, positionsWide, positionsHigh };
}

export function modelFromVector(
	weights: ArrayLike<number>,
	bias: number,
): HogModel {
	const histLength = HOG_WINDOW_CELL_COUNT * HOG_BINS;
	const histWeights = Float32Array.from(
		Array.prototype.slice.call(weights, 0, histLength) as number[],
	);
	const lumWeights = Float32Array.from(
		Array.prototype.slice.call(
			weights,
			histLength,
			histLength + HOG_WINDOW_CELL_COUNT,
		) as number[],
	);
	let lumWeightSum = 0;
	for (const w of lumWeights) {
		lumWeightSum += w;
	}
	return {
		histWeights,
		lumWeights,
		lumWeightSum,
		energyWeight: weights[histLength + HOG_WINDOW_CELL_COUNT] ?? 0,
		sigmaWeight: weights[histLength + HOG_WINDOW_CELL_COUNT + 1] ?? 0,
		bias,
	};
}

export function rgbToLuminance(r: number, g: number, b: number): number {
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function luminancePlane(
	pixels: Uint8Array | Buffer,
	width: number,
	height: number,
	channels: number,
): Float32Array {
	const out = new Float32Array(width * height);
	for (let i = 0; i < width * height; i += 1) {
		const pi = i * channels;
		out[i] = rgbToLuminance(pixels[pi]!, pixels[pi + 1]!, pixels[pi + 2]!);
	}
	return out;
}
