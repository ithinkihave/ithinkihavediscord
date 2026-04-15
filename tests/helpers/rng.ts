/**
 * Mulberry32 seeded pseudo-random number generator.
 * Returns values in [0, 1).
 */
export function mulberry32(seed: number): () => number {
	return function () {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Creates an RNG that returns values from a fixed sequence.
 * After exhausting the sequence, returns 1 (never triggers any check).
 */
export function createSequenceRandom(values: number[]): () => number {
	let index = 0;
	return () => {
		const value = values[index];
		index += 1;
		return value ?? 1;
	};
}
