import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WarBoard } from "../lib/emojiWar.ts";

function mulberry32(seed: number): () => number {
	return function () {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

describe("Even Board", () => {
	it("Should start with an equal number of pieces", () => {
		let board = new WarBoard(4, ["A", "B"]);
		let zeros = board.board.reduce(
			(acc, row) =>
				acc +
				row.filter((piece) => piece === 0).reduce((acc) => acc + 1, 0),
			0,
		);
		assert.equal(zeros, (4 * 4) / 2);
	});
});

describe("Edge generation", () => {
	it("Should eventually generate an edge involving the far-right column", () => {
		const size = 4;
		const board = new WarBoard(size, ["A", "B"], mulberry32(42));
		for (let r = 0; r < size; r++) {
			for (let c = 0; c < size; c++) {
				(board.board[r] as number[])[c] = 0;
			}
		}
		(board.board[0] as number[])[size - 1] = 1;

		for (let i = 0; i < 10000; i++) {
			board.updateGame();
			if ((board.board[0] as number[])[size - 1] === 0) break;
		}
		assert.equal(
			(board.board[0] as number[])[size - 1],
			0,
			"Far-right column cell was never updated via an edge",
		);
	});

	it("Should eventually generate an edge involving the bottom row", () => {
		const size = 4;
		const board = new WarBoard(size, ["A", "B"], mulberry32(42));
		for (let r = 0; r < size; r++) {
			for (let c = 0; c < size; c++) {
				(board.board[r] as number[])[c] = 0;
			}
		}
		(board.board[size - 1] as number[])[0] = 1;

		for (let i = 0; i < 10000; i++) {
			board.updateGame();
			if ((board.board[size - 1] as number[])[0] === 0) break;
		}
		assert.equal(
			(board.board[size - 1] as number[])[0],
			0,
			"Bottom row cell was never updated via an edge",
		);
	});
});
