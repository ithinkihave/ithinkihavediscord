import {
	type EffectAnimation,
	type EffectOptions,
	type RgbaImage,
	createRng,
	getFrameCount,
	hashUnit,
	renderEffect,
} from "./effect.ts";

const DEFAULT_BLACKHOLE_OPTIONS: EffectOptions = {
	fps: 20,
	holdMs: 600,
	activeMs: 1800,
	tailMs: 300,
	seed: 0xb1ac4,
};

// radians the innermost content winds round before it goes under
const MAX_TWIST = 11;
const RING_WIDTH = 3;
const RING_COLORS = [
	[255, 244, 214],
	[255, 186, 92],
	[236, 106, 38],
] as const;

/**
 * Spaghettification: a black hole opens in the middle of the card and
 * swallows it, inner parts winding round faster than the outside, before the
 * hole itself evaporates.
 */
export function renderBlackhole(
	card: RgbaImage,
	options: Partial<EffectOptions> = {},
): Promise<EffectAnimation> {
	return renderEffect(card, renderBlackholeFrames, {
		...DEFAULT_BLACKHOLE_OPTIONS,
		...options,
	});
}

export function* renderBlackholeFrames(
	card: RgbaImage,
	options: EffectOptions,
): Generator<Buffer> {
	const { width, height, data: source } = card;
	const rng = createRng(options.seed);
	// off-centre a little, so it doesn't look stamped on
	const cx = width * (0.4 + rng() * 0.2);
	const cy = height * (0.4 + rng() * 0.2);
	const reach = Math.hypot(
		Math.max(cx, width - cx),
		Math.max(cy, height - cy),
	);
	const maxHorizon = Math.min(width, height) * 0.09;
	const spin = rng() < 0.5 ? 1 : -1;

	const frameCount = getFrameCount(options);
	const holdFrames = Math.round((options.holdMs * options.fps) / 1000);
	const activeFrames = Math.max(
		1,
		Math.round((options.activeMs * options.fps) / 1000),
	);

	for (let frame = 0; frame < frameCount; frame += 1) {
		const progress = (frame - holdFrames) / activeFrames;
		if (progress < 0) {
			yield Buffer.from(source);
			continue;
		}

		const out = Buffer.alloc(width * height * 4);
		if (progress >= 1) {
			yield out;
			continue;
		}

		// how much of the card's radius is still outside the hole
		const squeeze = Math.pow(1 - progress, 1.6);
		const twist = spin * MAX_TWIST * progress * progress;
		// opens, swallows, then evaporates
		const horizon =
			maxHorizon * Math.sin(Math.PI * Math.min(1, progress * 1.1));

		for (let y = 0; y < height; y += 1) {
			const dy = y + 0.5 - cy;
			for (let x = 0; x < width; x += 1) {
				const dx = x + 0.5 - cx;
				const radius = Math.hypot(dx, dy);
				const oi = (y * width + x) * 4;

				if (radius < horizon) {
					out[oi + 3] = 255;
					continue;
				}
				if (radius < horizon + RING_WIDTH && horizon > 1) {
					const flicker = hashUnit(y * width + x, frame);
					const [r, g, b] =
						RING_COLORS[Math.floor(flicker * RING_COLORS.length)]!;
					out[oi] = r;
					out[oi + 1] = g;
					out[oi + 2] = b;
					out[oi + 3] = 255;
					continue;
				}

				// where this pixel was before the hole pulled it in
				const sourceRadius = radius / squeeze;
				if (sourceRadius > reach) {
					continue;
				}
				const inner = 1 - sourceRadius / reach;
				const angle = Math.atan2(dy, dx) - twist * inner * inner;
				const sx = Math.floor(cx + Math.cos(angle) * sourceRadius);
				const sy = Math.floor(cy + Math.sin(angle) * sourceRadius);
				if (sx < 0 || sy < 0 || sx >= width || sy >= height) {
					continue;
				}
				const si = (sy * width + sx) * 4;
				out[oi] = source[si]!;
				out[oi + 1] = source[si + 1]!;
				out[oi + 2] = source[si + 2]!;
				out[oi + 3] = source[si + 3]!;
			}
		}

		yield out;
	}
}
