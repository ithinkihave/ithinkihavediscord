import {
	type EffectAnimation,
	type EffectOptions,
	type RgbaImage,
	createRng,
	getFrameCount,
	renderEffect,
} from "./effect.ts";

const DEFAULT_MELT_OPTIONS: EffectOptions = {
	fps: 20,
	holdMs: 600,
	activeMs: 1600,
	tailMs: 200,
	seed: 0xd00d,
};

const COLUMN_WIDTH = 3;
// columns start at staggered times, wandering at most this far apart
const MAX_START_DELAY = 0.35;
const DELAY_STEP = 0.025;

/**
 * Doom's screen wipe: the card is cut into thin columns that slide down off
 * the bottom at staggered, wandering start times, picking up speed as they
 * go.
 */
export function renderMelt(
	card: RgbaImage,
	options: Partial<EffectOptions> = {},
): Promise<EffectAnimation> {
	return renderEffect(card, renderMeltFrames, {
		...DEFAULT_MELT_OPTIONS,
		...options,
	});
}

export function* renderMeltFrames(
	card: RgbaImage,
	options: EffectOptions,
): Generator<Buffer> {
	const { width, height, data: source } = card;
	const rng = createRng(options.seed);

	// the same random walk the original used, so neighbours start together
	const columns = Math.ceil(width / COLUMN_WIDTH);
	const startAt = new Float32Array(columns);
	startAt[0] = rng() * MAX_START_DELAY;
	for (let c = 1; c < columns; c += 1) {
		const step = (Math.floor(rng() * 3) - 1) * DELAY_STEP;
		startAt[c] = Math.min(
			MAX_START_DELAY,
			Math.max(0, startAt[c - 1]! + step),
		);
	}

	const frameCount = getFrameCount(options);
	const holdFrames = Math.round((options.holdMs * options.fps) / 1000);
	const activeFrames = Math.max(
		1,
		Math.round((options.activeMs * options.fps) / 1000),
	);
	// every column has to clear the bottom before the active time is up
	const fallTime = 1 - MAX_START_DELAY;
	const rowStride = width * 4;

	for (let frame = 0; frame < frameCount; frame += 1) {
		const out = Buffer.alloc(width * height * 4);
		const progress = (frame - holdFrames) / activeFrames;

		for (let c = 0; c < columns; c += 1) {
			const fallen = Math.max(0, (progress - startAt[c]!) / fallTime);
			// accelerating, like the original's doubling step
			const offset = Math.round(fallen * fallen * height * 1.05);
			if (offset >= height) {
				continue;
			}

			const x0 = c * COLUMN_WIDTH;
			const bytes = Math.min(COLUMN_WIDTH, width - x0) * 4;
			for (let y = offset; y < height; y += 1) {
				const from = (y - offset) * rowStride + x0 * 4;
				source.copy(out, y * rowStride + x0 * 4, from, from + bytes);
			}
		}

		yield out;
	}
}
