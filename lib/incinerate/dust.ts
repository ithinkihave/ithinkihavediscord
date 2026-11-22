import {
	type EffectAnimation,
	type EffectOptions,
	type RgbaImage,
	buildValueNoise,
	createRng,
	getFrameCount,
	hashUnit,
	lerp,
	renderEffect,
} from "./effect.ts";

const DEFAULT_DUST_OPTIONS: EffectOptions = {
	fps: 20,
	holdMs: 600,
	activeMs: 2200,
	tailMs: 800,
	seed: 0x7a4405,
};

// pixels per flake edge
const FLAKE_SIZE = 2;
// how much of the start time comes from the sweep vs. noise
const SWEEP_WEIGHT = 0.6;
// fraction of the active time the last flake to go spends drifting
const DRIFT_SHARE = 0.45;
const DUST_COLOR = [92, 78, 66] as const;

/**
 * The Thanos snap. The card breaks into small flakes, swept from one
 * side to the other, which drift off on the wind, browning to ash and
 * thinning out as they go.
 */
export function renderDust(
	card: RgbaImage,
	options: Partial<EffectOptions> = {},
): Promise<EffectAnimation> {
	return renderEffect(card, renderDustFrames, {
		...DEFAULT_DUST_OPTIONS,
		...options,
	});
}

export function* renderDustFrames(
	card: RgbaImage,
	options: EffectOptions,
): Generator<Buffer> {
	const { width, height, data: source } = card;
	const rng = createRng(options.seed);
	const noise = buildValueNoise(width, height, [40, 16, 6], rng);
	const fromLeft = rng() < 0.5;
	const wind = fromLeft ? 1 : -1;

	const flakesX = Math.ceil(width / FLAKE_SIZE);
	const flakesY = Math.ceil(height / FLAKE_SIZE);
	const flakeCount = flakesX * flakesY;
	const startAt = new Float32Array(flakeCount);
	const vx = new Float32Array(flakeCount);
	const vy = new Float32Array(flakeCount);
	const phase = new Float32Array(flakeCount);
	// bare card background just vanishes; only text, avatar and media blow away
	const isContent = new Uint8Array(flakeCount);
	const background = [source[0]!, source[1]!, source[2]!, source[3]!];

	for (let fy = 0; fy < flakesY; fy += 1) {
		for (let fx = 0; fx < flakesX; fx += 1) {
			const i = fy * flakesX + fx;
			const x = Math.min(width - 1, fx * FLAKE_SIZE);
			const y = Math.min(height - 1, fy * FLAKE_SIZE);
			const sweep = fromLeft ? x / width : 1 - x / width;
			startAt[i] =
				(sweep * SWEEP_WEIGHT +
					noise[y * width + x]! * (1 - SWEEP_WEIGHT)) *
				(1 - DRIFT_SHARE);
			vx[i] = wind * (1.2 + rng() * 3.2);
			vy[i] = -(0.3 + rng() * 1.6);
			phase[i] = rng() * Math.PI * 2;
			isContent[i] = flakeHasContent(
				source,
				width,
				height,
				x,
				y,
				background,
			)
				? 1
				: 0;
		}
	}

	const frameCount = getFrameCount(options);
	const holdFrames = Math.round((options.holdMs * options.fps) / 1000);
	const activeFrames = Math.max(
		1,
		Math.round((options.activeMs * options.fps) / 1000),
	);
	const lifeFrames = activeFrames * DRIFT_SHARE;

	for (let frame = 0; frame < frameCount; frame += 1) {
		const out = Buffer.alloc(width * height * 4);
		const progress = (frame - holdFrames) / activeFrames;

		// still-attached flakes first, so drifting ones are drawn over them
		for (let pass = 0; pass < 2; pass += 1) {
			for (let i = 0; i < flakeCount; i += 1) {
				const age = (progress - startAt[i]!) * activeFrames;
				const loose = age > 0;
				if ((pass === 0) === loose) {
					continue;
				}

				const fx = i % flakesX;
				const fy = (i / flakesX) | 0;
				let x = fx * FLAKE_SIZE;
				let y = fy * FLAKE_SIZE;
				let ashen = 0;

				if (loose) {
					if (!isContent[i]) {
						continue;
					}
					const t = age / lifeFrames;
					// thin out: each flake has its own moment to vanish
					if (t >= 1 || hashUnit(i, options.seed) < t * t) {
						continue;
					}
					// wind picks up as it goes, with a bit of turbulence
					x +=
						vx[i]! * age * (1 + t) +
						Math.sin(age * 0.25 + phase[i]!) * 3;
					y += vy[i]! * age + Math.cos(age * 0.2 + phase[i]!) * 2;
					ashen = Math.min(1, t * 1.6);
				}

				drawFlake(
					out,
					source,
					width,
					height,
					fx * FLAKE_SIZE,
					fy * FLAKE_SIZE,
					Math.round(x),
					Math.round(y),
					ashen,
				);
			}
		}

		yield out;
	}
}

function drawFlake(
	out: Buffer,
	source: Buffer,
	width: number,
	height: number,
	sx: number,
	sy: number,
	dx: number,
	dy: number,
	ashen: number,
) {
	for (let oy = 0; oy < FLAKE_SIZE; oy += 1) {
		const srcY = sy + oy;
		const dstY = dy + oy;
		if (srcY >= height || dstY < 0 || dstY >= height) {
			continue;
		}
		for (let ox = 0; ox < FLAKE_SIZE; ox += 1) {
			const srcX = sx + ox;
			const dstX = dx + ox;
			if (srcX >= width || dstX < 0 || dstX >= width) {
				continue;
			}
			const si = (srcY * width + srcX) * 4;
			if (source[si + 3] === 0) {
				continue;
			}
			const di = (dstY * width + dstX) * 4;
			out[di] = lerp(source[si]!, DUST_COLOR[0], ashen);
			out[di + 1] = lerp(source[si + 1]!, DUST_COLOR[1], ashen);
			out[di + 2] = lerp(source[si + 2]!, DUST_COLOR[2], ashen);
			out[di + 3] = 255;
		}
	}
}

function flakeHasContent(
	source: Buffer,
	width: number,
	height: number,
	x: number,
	y: number,
	background: number[],
): boolean {
	for (let oy = 0; oy < FLAKE_SIZE && y + oy < height; oy += 1) {
		for (let ox = 0; ox < FLAKE_SIZE && x + ox < width; ox += 1) {
			const pi = ((y + oy) * width + x + ox) * 4;
			if (source[pi + 3] === 0) {
				continue;
			}
			// on a transparent card anything visible is content
			if (background[3] === 0) {
				return true;
			}
			const difference =
				Math.abs(source[pi]! - background[0]!) +
				Math.abs(source[pi + 1]! - background[1]!) +
				Math.abs(source[pi + 2]! - background[2]!);
			if (difference > 24) {
				return true;
			}
		}
	}
	return false;
}
