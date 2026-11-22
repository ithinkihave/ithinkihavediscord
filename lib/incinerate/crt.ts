import {
	type EffectAnimation,
	type EffectOptions,
	type RgbaImage,
	clampByte,
	createRng,
	getFrameCount,
	lerp,
	renderEffect,
} from "./effect.ts";

const DEFAULT_CRT_OPTIONS: EffectOptions = {
	fps: 20,
	holdMs: 600,
	activeMs: 1300,
	tailMs: 300,
	seed: 0xc47,
};

// share of the active time spent on each stage
const GLITCH_END = 0.18;
const SQUASH_END = 0.5;
const LINE_END = 0.78;
const LINE_THICKNESS = 3;
const PHOSPHOR = [214, 236, 255] as const;

/**
 * An old telly switching off: a moment of signal trouble, then the picture
 * collapses into a bright horizontal line, the line into a dot, and the dot
 * fades out.
 */
export function renderCrt(
	card: RgbaImage,
	options: Partial<EffectOptions> = {},
): Promise<EffectAnimation> {
	return renderEffect(card, renderCrtFrames, {
		...DEFAULT_CRT_OPTIONS,
		...options,
	});
}

export function* renderCrtFrames(
	card: RgbaImage,
	options: EffectOptions,
): Generator<Buffer> {
	const { width, height, data: source } = card;
	const rng = createRng(options.seed);
	const frameCount = getFrameCount(options);
	const holdFrames = Math.round((options.holdMs * options.fps) / 1000);
	const activeFrames = Math.max(
		1,
		Math.round((options.activeMs * options.fps) / 1000),
	);
	const cx = width / 2;
	const cy = height / 2;

	for (let frame = 0; frame < frameCount; frame += 1) {
		const progress = (frame - holdFrames) / activeFrames;
		const out = Buffer.alloc(width * height * 4);

		if (progress < 0) {
			source.copy(out);
		} else if (progress < GLITCH_END) {
			drawGlitch(out, source, width, height, progress / GLITCH_END, rng);
		} else if (progress < SQUASH_END) {
			const t = (progress - GLITCH_END) / (SQUASH_END - GLITCH_END);
			// ease-in: it hangs on for a moment, then snaps shut
			const scaleY = Math.max(LINE_THICKNESS / height, 1 - t * t);
			drawSquashed(out, source, width, height, scaleY, t);
		} else if (progress < LINE_END) {
			const t = (progress - SQUASH_END) / (LINE_END - SQUASH_END);
			const half = Math.max(1, (width / 2) * (1 - t * t));
			fillRect(out, width, cx - half, cy - 1, half * 2, LINE_THICKNESS);
		} else if (progress < 1) {
			const t = (progress - LINE_END) / (1 - LINE_END);
			const radius = 4 * (1 - t);
			if (radius >= 0.5) {
				fillDot(out, width, height, cx, cy, radius);
			}
		}

		yield out;
	}
}

/** Rows shoved sideways and the colour channels pulled apart. */
function drawGlitch(
	out: Buffer,
	source: Buffer,
	width: number,
	height: number,
	t: number,
	rng: () => number,
) {
	const split = Math.round(2 + t * 6);
	let shift = 0;
	for (let y = 0; y < height; y += 1) {
		// bands of rows tear together
		if (rng() < 0.08) {
			shift = Math.round((rng() - 0.5) * 30 * t);
		}
		for (let x = 0; x < width; x += 1) {
			const oi = (y * width + x) * 4;
			const sample = (dx: number) => {
				const sx = Math.min(width - 1, Math.max(0, x + shift + dx));
				return (y * width + sx) * 4;
			};
			const red = sample(-split);
			const green = sample(0);
			const blue = sample(split);
			out[oi] = source[red]!;
			out[oi + 1] = source[green + 1]!;
			out[oi + 2] = source[blue + 2]!;
			out[oi + 3] = source[green + 3]!;
		}
	}
}

function drawSquashed(
	out: Buffer,
	source: Buffer,
	width: number,
	height: number,
	scaleY: number,
	glow: number,
) {
	const cy = height / 2;
	for (let y = 0; y < height; y += 1) {
		const sy = Math.floor(cy + (y + 0.5 - cy) / scaleY);
		if (sy < 0 || sy >= height) {
			continue;
		}
		for (let x = 0; x < width; x += 1) {
			const si = (sy * width + x) * 4;
			const oi = (y * width + x) * 4;
			if (source[si + 3] === 0) {
				continue;
			}
			// the beam gets brighter as it squeezes into less screen
			out[oi] = clampByte(lerp(source[si]!, PHOSPHOR[0], glow));
			out[oi + 1] = clampByte(lerp(source[si + 1]!, PHOSPHOR[1], glow));
			out[oi + 2] = clampByte(lerp(source[si + 2]!, PHOSPHOR[2], glow));
			out[oi + 3] = 255;
		}
	}
}

function fillRect(
	out: Buffer,
	width: number,
	left: number,
	top: number,
	rectWidth: number,
	rectHeight: number,
) {
	const x0 = Math.max(0, Math.floor(left));
	const x1 = Math.min(width, Math.ceil(left + rectWidth));
	const height = out.length / 4 / width;
	const y0 = Math.max(0, Math.floor(top));
	const y1 = Math.min(height, Math.ceil(top + rectHeight));
	for (let y = y0; y < y1; y += 1) {
		for (let x = x0; x < x1; x += 1) {
			const oi = (y * width + x) * 4;
			out[oi] = 255;
			out[oi + 1] = 255;
			out[oi + 2] = 255;
			out[oi + 3] = 255;
		}
	}
}

function fillDot(
	out: Buffer,
	width: number,
	height: number,
	cx: number,
	cy: number,
	radius: number,
) {
	const reach = Math.ceil(radius * 2.5);
	for (let y = Math.floor(cy - reach); y <= cy + reach; y += 1) {
		for (let x = Math.floor(cx - reach); x <= cx + reach; x += 1) {
			if (x < 0 || y < 0 || x >= width || y >= height) {
				continue;
			}
			const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
			if (distance > radius * 2.5) {
				continue;
			}
			// white core, blue-ish halo
			const core = distance <= radius;
			const oi = (y * width + x) * 4;
			out[oi] = core ? 255 : PHOSPHOR[0];
			out[oi + 1] = core ? 255 : PHOSPHOR[1];
			out[oi + 2] = 255;
			out[oi + 3] = 255;
		}
	}
}
