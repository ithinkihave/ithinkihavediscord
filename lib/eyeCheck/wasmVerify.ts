import { readFileSync } from "node:fs";

// The kernel (zncc.wat) scores eight horizontally adjacent windows at once and
// advances one window row per `rowStride * 3` floats, a layout built for its
// original stride-3 full-frame scan. Here each proposal's neighbourhood is
// copied into a small patch with a pitch of PATCH_PITCH floats and passed with
// rowStride = PATCH_PITCH / 3, so window rows step one pixel row: a stride-1
// scan of up to MAX_WINDOWS x MAX_WINDOWS windows.
const TEMPLATE_SIZE = 32;
const MAX_WINDOWS = 16;
// widest read: lane 15 of the second group plus a 31px template offset
const PATCH_PITCH = 48;
const PATCH_ROWS = MAX_WINDOWS + TEMPLATE_SIZE - 1;
const ENTRY_BYTES = 12;
const TRIPLET_BYTES = 12;
const OUTPUT_CAPACITY = MAX_WINDOWS * MAX_WINDOWS;
// ZNCC is unchanged by a constant offset; centring keeps f32 sums precise
const LUMINANCE_CENTER = 128;

export type KernelTemplate = {
	activeCount: number;
	dx: Int16Array;
	dy: Int16Array;
	weights: Float32Array;
	luminanceDeviations: Float32Array;
	luminanceStdDev: number;
	weightSum: number;
};

type ScanTemplate = (
	planes: number,
	rowStride: number,
	winRows: number,
	winCols: number,
	tpl: number,
	count: number,
	invWeightSum: number,
	stdDev: number,
	minVariance: number,
	threshold: number,
	out: number,
	outCap: number,
) => number;

// tsconfig targets plain ES2022 (no DOM lib), so describe the bits we use.
const { WebAssembly: wasm } = globalThis as unknown as {
	WebAssembly: {
		Module: new (bytes: Uint8Array) => object;
		Instance: new (
			module: object,
			imports: object,
		) => {
			exports: {
				memory: { buffer: ArrayBuffer; grow(pages: number): number };
				scanTemplate: ScanTemplate;
			};
		};
	};
};

/**
 * Finds every (window, template) pair in a small neighbourhood whose masked
 * ZNCC, computed in f32 SIMD, reaches `threshold`. Callers re-score those in
 * f64 before deciding anything, so the f32 pass only has to never miss.
 */
export class NeighbourhoodScanner {
	private readonly scanTemplate: ScanTemplate;
	private readonly memory: { buffer: ArrayBuffer };
	private readonly templateStarts: number[] = [];
	private readonly patchAt = 0;
	private readonly outAt: number;
	private readonly templates: KernelTemplate[];

	constructor(templates: KernelTemplate[]) {
		this.templates = templates;
		const { exports } = new wasm.Instance(
			new wasm.Module(
				readFileSync(new URL("./zncc.wasm", import.meta.url)),
			),
			{},
		);
		this.scanTemplate = exports.scanTemplate;
		this.memory = exports.memory;

		const patchBytes = PATCH_PITCH * (PATCH_ROWS + 1) * 4;
		const entryCount = templates.reduce((sum, t) => sum + t.activeCount, 0);
		const templatesAt = align16(patchBytes);
		this.outAt = align16(templatesAt + entryCount * ENTRY_BYTES);
		const needed = this.outAt + OUTPUT_CAPACITY * TRIPLET_BYTES;
		const missing = needed - exports.memory.buffer.byteLength;
		if (missing > 0) {
			exports.memory.grow(Math.ceil(missing / 65536));
		}

		const i32 = new Int32Array(exports.memory.buffer);
		const f32 = new Float32Array(exports.memory.buffer);
		let cursor = templatesAt / 4;
		for (const template of templates) {
			this.templateStarts.push(cursor * 4);
			for (let k = 0; k < template.activeCount; k += 1) {
				i32[cursor] =
					(template.dy[k]! * PATCH_PITCH + template.dx[k]!) * 4;
				f32[cursor + 1] = template.weights[k]!;
				f32[cursor + 2] = template.luminanceDeviations[k]!;
				cursor += 3;
			}
		}
	}

	/**
	 * Scans windows with top-left corners in [minX, maxX] x [minY, maxY]
	 * (at most MAX_WINDOWS each way) and reports candidates via `onCandidate`.
	 */
	scan(
		lum: Float32Array,
		width: number,
		minX: number,
		maxX: number,
		minY: number,
		maxY: number,
		minVariance: number,
		threshold: number,
		onCandidate: (template: number, x: number, y: number) => void,
	): void {
		const winCols = maxX - minX + 1;
		const winRows = maxY - minY + 1;
		if (winCols <= 0 || winRows <= 0) {
			return;
		}
		if (winCols > MAX_WINDOWS || winRows > MAX_WINDOWS) {
			throw new Error(`neighbourhood too large: ${winCols}x${winRows}`);
		}

		const patch = new Float32Array(
			this.memory.buffer,
			this.patchAt,
			PATCH_PITCH * PATCH_ROWS,
		);
		const columns = winCols + TEMPLATE_SIZE - 1;
		const rows = winRows + TEMPLATE_SIZE - 1;
		for (let row = 0; row < rows; row += 1) {
			const source = (minY + row) * width + minX;
			const target = row * PATCH_PITCH;
			for (let column = 0; column < columns; column += 1) {
				patch[target + column] =
					lum[source + column]! - LUMINANCE_CENTER;
			}
		}

		const out = new Int32Array(
			this.memory.buffer,
			this.outAt,
			OUTPUT_CAPACITY * 3,
		);
		for (let t = 0; t < this.templates.length; t += 1) {
			const template = this.templates[t]!;
			if (template.luminanceStdDev <= 0 || template.weightSum <= 0) {
				continue;
			}
			const written = this.scanTemplate(
				this.patchAt,
				PATCH_PITCH / 3,
				winRows,
				winCols,
				this.templateStarts[t]!,
				template.activeCount,
				1 / template.weightSum,
				template.luminanceStdDev,
				minVariance,
				threshold,
				this.outAt,
				OUTPUT_CAPACITY,
			);
			for (let i = 0; i < written; i += 1) {
				onCandidate(t, minX + out[i * 3 + 1]!, minY + out[i * 3]!);
			}
		}
	}
}

export const MAX_NEIGHBOURHOOD = MAX_WINDOWS;

function align16(value: number): number {
	return (value + 15) & ~15;
}
