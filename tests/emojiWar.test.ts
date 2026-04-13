import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WarBoard } from "../lib/emojiWar.ts";

describe("Even Board", () => {
  it("Should start with an equal number of pieces", () => {
    let board = new WarBoard(4, ["A", "B"]);
    let zeros = board.board.reduce((acc, row, _) => acc + row.filter((piece) => piece == 0).reduce((acc, _, _i) => acc + 1, 0), 0)
    assert.equal(zeros, 4 * 4 / 2);
  });
});
