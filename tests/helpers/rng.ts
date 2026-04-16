/**
 * Expands a 32-bit seed into a 32-bit integer using splitmix32.
 * Used to derive xoshiro128++ state words from a single seed.
 */
function splitmix32(seed: number): () => number {
	let s = seed | 0;
	return function () {
		s = (s + 0x9e3779b9) | 0;
		let z = s;
		z = Math.imul(z ^ (z >>> 16), 0x85ebca6b | 0);
		z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35 | 0);
		return (z ^ (z >>> 16)) >>> 0;
	};
}

/**
 * xoshiro128++ seeded pseudo-random number generator.
 * 128-bit state, period 2^128-1, passes PractRand.
 * Returns values in [0, 1).
 */
export function xoshiro128pp(seed: number): () => number {
	const sm = splitmix32(seed);
	let s0 = sm();
	let s1 = sm();
	let s2 = sm();
	let s3 = sm();

	return function () {
		const result = (((s0 + s3) | 0) + s0) >>> 0;
		const t = s1 << 9;
		s2 ^= s0;
		s3 ^= s1;
		s1 ^= s2;
		s0 ^= s3;
		s2 ^= t;
		s3 = ((s3 << 11) | (s3 >>> 21)) >>> 0;
		return result / 4294967296;
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
