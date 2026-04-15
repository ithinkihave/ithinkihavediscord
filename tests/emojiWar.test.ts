import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WarBoard } from "../lib/emojiWar.ts";
import { mulberry32 } from "./helpers/rng.ts";

describe("Even Board", () => {
	it("Should start with an equal number of pieces", () => {
		const board = new WarBoard(4, ["A", "B"]);
		const zeros = board.board.reduce(
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

describe("Snat scarcity strength", () => {
	it("Should lose less often when fewer snat pieces remain", () => {
		const snat = "<:snat:1489862058727051394>";
		const runs = 2000;

		const simulateSnatWinRate = (
			initialBoard: number[][],
			seed: number,
		): number => {
			const rng = mulberry32(seed);
			let wins = 0;
			for (let i = 0; i < runs; i++) {
				let randomStep = 0;
				const board = new WarBoard(2, [snat, "A"], () => {
					const phase = randomStep % 4;
					randomStep++;
					if (phase === 0) return 0; // horizontal edge
					if (phase === 1) return 0; // row = 0
					if (phase === 2) return 0; // col = 0
					return rng();
				});

				for (let r = 0; r < 2; r++) {
					for (let c = 0; c < 2; c++) {
						(board.board[r] as number[])[c] =
							initialBoard[r]?.[c] ?? 0;
					}
				}

				board.updateGame();
				if ((board.board[0] as number[])[0] === 0) {
					wins++;
				}
			}
			return wins / runs;
		};

		const abundantSnatWinRate = simulateSnatWinRate(
			[
				[0, 1],
				[0, 1],
			],
			101,
		);
		const scarceSnatWinRate = simulateSnatWinRate(
			[
				[0, 1],
				[1, 1],
			],
			202,
		);

		assert.ok(
			scarceSnatWinRate > abundantSnatWinRate,
			`Expected scarce snat win rate (${scarceSnatWinRate}) to exceed abundant snat win rate (${abundantSnatWinRate})`,
		);
	});
});
