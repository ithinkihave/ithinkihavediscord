import {
	type EffectAnimation,
	type EffectOptions,
	type RgbaImage,
	buildValueNoise,
	clamp01,
	clampByte,
	createRng,
	getFrameCount,
	hashUnit,
	lerp,
	renderEffect,
} from "./effect.ts";

export type { EffectOptions as BurnOptions, RgbaImage };
export { getFrameCount };
const DEFAULT_BURN_OPTIONS: EffectOptions = {
	fps: 20,
	holdMs: 600,
	activeMs: 1900,
	tailMs: 700,
	seed: 0x0b5e55ed,
};

// Widths of each burn band, in units of the normalised ignition-time field.
const SCORCH_BAND = 0.08;
const GLOW_BAND = 0.03;
const CHAR_BAND = 0.035;
const CRUMBLE_START = 0.6;
const NOISE_AMPLITUDE = 0.3;
// fire climbs faster than it spreads down or sideways
const UPWARD_SPREAD = 0.6;
const DOWNWARD_SPREAD = 1.6;

const MAX_EMBERS_PER_FRAME = 16;
const MAX_ASH_PER_FRAME = 3;

const GLOW_GRADIENT: Array<[number, number, number, number]> = [
	[0, 255, 252, 214],
	[0.25, 255, 214, 92],
	[0.55, 250, 128, 28],
	[0.8, 196, 52, 14],
	[1, 92, 22, 8],
];

const EMBER_GRADIENT: Array<[number, number, number, number]> = [
	[0, 255, 244, 170],
	[0.4, 255, 160, 48],
	[0.75, 226, 72, 18],
	[1, 120, 28, 10],
];

type Particle = {
	x: number;
	y: number;
	vx: number;
	vy: number;
	age: number;
	life: number;
	phase: number;
	size: number;
	ash: boolean;
};

export function renderBurn(
	card: RgbaImage,
	options: Partial<EffectOptions> = {},
): Promise<EffectAnimation> {
	return renderEffect(card, renderBurnFrames, {
		...DEFAULT_BURN_OPTIONS,
		...options,
	});
}

export function* renderBurnFrames(
	card: RgbaImage,
	options: EffectOptions,
): Generator<Buffer> {
	const { width, height, data: source } = card;
	const rng = createRng(options.seed);
	const igniteAt = buildIgnitionField(width, height, rng);
	const crumble = buildValueNoise(width, height, [3, 2], rng);

	const frameCount = getFrameCount(options);
	const holdFrames = Math.round((options.holdMs * options.fps) / 1000);
	const burnFrames = Math.max(
		1,
		Math.round((options.activeMs * options.fps) / 1000),
	);
	const endOfBurn = 1 + GLOW_BAND + CHAR_BAND;

	const particles: Particle[] = [];
	const pixelCount = width * height;

	for (let frame = 0; frame < frameCount; frame += 1) {
		const out = Buffer.allocUnsafe(pixelCount * 4);
		const progress = (frame - holdFrames) / burnFrames;
		// ease-in: a slow catch, then it really goes
		const front =
			progress < 0
				? -1
				: Math.pow(Math.min(progress, 1), 1.35) * endOfBurn;
		const flickerSeed = (frame * 2654435761) >>> 0;

		for (let i = 0; i < pixelCount; i += 1) {
			const pi = i * 4;
			const s = front - igniteAt[i]!;

			// only the message burns; empty card (or chat, when transparent)
			// has nothing to set alight
			if (source[pi + 3] === 0) {
				out[pi] = 0;
				out[pi + 1] = 0;
				out[pi + 2] = 0;
				out[pi + 3] = 0;
				continue;
			}

			if (s < -SCORCH_BAND) {
				out[pi] = source[pi]!;
				out[pi + 1] = source[pi + 1]!;
				out[pi + 2] = source[pi + 2]!;
				out[pi + 3] = source[pi + 3]!;
				continue;
			}

			if (s < 0) {
				shadeScorch(
					out,
					source,
					pi,
					(s + SCORCH_BAND) / SCORCH_BAND,
					s,
				);
				continue;
			}

			if (s < GLOW_BAND) {
				const flicker = hashUnit(i, flickerSeed) * 0.18 - 0.09;
				const [r, g, b] = sampleGradient(
					GLOW_GRADIENT,
					clamp01(s / GLOW_BAND + flicker),
				);
				out[pi] = r;
				out[pi + 1] = g;
				out[pi + 2] = b;
				out[pi + 3] = 255;
				continue;
			}

			const charred = (s - GLOW_BAND) / CHAR_BAND;
			if (charred >= 1 || charred > CRUMBLE_START + crumble[i]! * 0.5) {
				out[pi] = 0;
				out[pi + 1] = 0;
				out[pi + 2] = 0;
				out[pi + 3] = 0;
				continue;
			}

			// smouldering char with the odd live speck
			if (hashUnit(i, flickerSeed ^ 0x9e3779b9) < 0.05 * (1 - charred)) {
				out[pi] = 255;
				out[pi + 1] = 140 + ((hashUnit(i, flickerSeed) * 80) | 0);
				out[pi + 2] = 40;
			} else {
				out[pi] = lerp(78, 22, charred);
				out[pi + 1] = lerp(26, 17, charred);
				out[pi + 2] = lerp(10, 14, charred);
			}
			out[pi + 3] = 255;
		}

		if (progress >= 0 && progress <= 1.05) {
			spawnParticles(particles, igniteAt, width, height, front, rng);
		}
		stepAndDrawParticles(particles, out, width, height);

		yield out;
	}
}

function shadeScorch(
	out: Buffer,
	source: Buffer,
	pi: number,
	amount: number,
	s: number,
) {
	const alpha = source[pi + 3]!;
	if (alpha === 0) {
		out[pi] = 0;
		out[pi + 1] = 0;
		out[pi + 2] = 0;
		out[pi + 3] = 0;
		return;
	}

	const r = source[pi]!;
	const g = source[pi + 1]!;
	const b = source[pi + 2]!;
	const k = amount * amount;
	// paper browning: pull towards a dark sepia of the original
	const luminance = 0.3 * r + 0.59 * g + 0.11 * b;
	const sepiaR = luminance * 0.55 + 38;
	const sepiaG = luminance * 0.38 + 18;
	const sepiaB = luminance * 0.22 + 6;
	// light thrown forward by the flames
	const glow = s > -0.025 ? (1 + s / 0.025) * 0.75 : 0;

	out[pi] = clampByte(lerp(r, sepiaR, k) + glow * 200);
	out[pi + 1] = clampByte(lerp(g, sepiaG, k) + glow * 90);
	out[pi + 2] = clampByte(lerp(b, sepiaB, k) + glow * 10);
	out[pi + 3] = alpha;
}

function spawnParticles(
	particles: Particle[],
	igniteAt: Float32Array,
	width: number,
	height: number,
	front: number,
	rng: () => number,
) {
	let embers = 0;
	let ash = 0;
	for (
		let attempt = 0;
		attempt < 600 &&
		(embers < MAX_EMBERS_PER_FRAME || ash < MAX_ASH_PER_FRAME);
		attempt += 1
	) {
		const x = (rng() * width) | 0;
		const y = (rng() * height) | 0;
		const s = front - igniteAt[y * width + x]!;

		if (s >= 0 && s < GLOW_BAND && embers < MAX_EMBERS_PER_FRAME) {
			embers += 1;
			particles.push({
				x,
				y,
				vx: (rng() - 0.5) * 1.4,
				vy: -(1.2 + rng() * 2.8),
				age: 0,
				life: 10 + rng() * 22,
				phase: rng() * Math.PI * 2,
				size: rng() < 0.25 ? 2 : 1,
				ash: false,
			});
		} else if (
			s >= GLOW_BAND &&
			s < GLOW_BAND + CHAR_BAND &&
			ash < MAX_ASH_PER_FRAME
		) {
			ash += 1;
			particles.push({
				x,
				y,
				vx: (rng() - 0.5) * 0.8,
				vy: -(0.4 + rng() * 1.2),
				age: 0,
				life: 14 + rng() * 20,
				phase: rng() * Math.PI * 2,
				size: 2,
				ash: true,
			});
		}
	}
}

function stepAndDrawParticles(
	particles: Particle[],
	out: Buffer,
	width: number,
	height: number,
) {
	let write = 0;
	for (const particle of particles) {
		particle.age += 1;
		if (particle.age >= particle.life) {
			continue;
		}

		particle.x +=
			particle.vx + Math.sin(particle.age * 0.45 + particle.phase) * 0.5;
		particle.y += particle.vy;
		particle.vy *= 0.97;
		if (particle.y < -2 || particle.x < -2 || particle.x > width + 1) {
			continue;
		}
		particles[write] = particle;
		write += 1;

		const t = particle.age / particle.life;
		const [r, g, b] = particle.ash
			? ([lerp(70, 40, t), lerp(64, 38, t), lerp(60, 36, t)] as const)
			: sampleGradient(EMBER_GRADIENT, t);
		const px = Math.round(particle.x);
		const py = Math.round(particle.y);

		for (let dy = 0; dy < particle.size; dy += 1) {
			for (let dx = 0; dx < particle.size; dx += 1) {
				const x = px + dx;
				const y = py + dy;
				if (x < 0 || y < 0 || x >= width || y >= height) {
					continue;
				}
				const pi = (y * width + x) * 4;
				out[pi] = r;
				out[pi + 1] = g;
				out[pi + 2] = b;
				out[pi + 3] = 255;
			}
		}
	}
	particles.length = write;
}

/**
 * Time (0..1) at which each pixel catches. Distance from an ignition point
 * at the bottom edge, stretched so flames climb, roughened with fractal
 * noise so the front is ragged instead of a neat circle.
 */
function buildIgnitionField(
	width: number,
	height: number,
	rng: () => number,
): Float32Array {
	const noise = buildValueNoise(width, height, [48, 24, 12, 6], rng);
	const sources = [
		{ x: width * (0.2 + rng() * 0.6), y: height + 6, delay: 0 },
	];
	if (rng() < 0.6) {
		sources.push({
			x: width * (0.1 + rng() * 0.8),
			y: height * (0.15 + rng() * 0.5),
			delay: 0.25 + rng() * 0.2,
		});
	}

	const field = new Float32Array(width * height);
	const reach = Math.hypot(width, height * UPWARD_SPREAD);
	let min = Infinity;
	let max = -Infinity;

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const i = y * width + x;
			let best = Infinity;
			for (const source of sources) {
				const dy = y - source.y;
				const stretchedDy =
					dy < 0 ? dy * UPWARD_SPREAD : dy * DOWNWARD_SPREAD;
				const distance =
					Math.hypot(x - source.x, stretchedDy) / reach +
					source.delay;
				best = Math.min(best, distance);
			}
			const value = best + (noise[i]! - 0.5) * NOISE_AMPLITUDE;
			field[i] = value;
			min = Math.min(min, value);
			max = Math.max(max, value);
		}
	}

	const span = max - min || 1;
	for (let i = 0; i < field.length; i += 1) {
		field[i] = (field[i]! - min) / span;
	}
	return field;
}

function sampleGradient(
	stops: Array<[number, number, number, number]>,
	t: number,
): [number, number, number] {
	for (let i = 1; i < stops.length; i += 1) {
		const [end, r1, g1, b1] = stops[i]!;
		if (t <= end) {
			const [start, r0, g0, b0] = stops[i - 1]!;
			const k = (t - start) / (end - start || 1);
			return [lerp(r0, r1, k), lerp(g0, g1, k), lerp(b0, b1, k)];
		}
	}
	const [, r, g, b] = stops[stops.length - 1]!;
	return [r, g, b];
}
