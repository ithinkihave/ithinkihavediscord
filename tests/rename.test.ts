import { describe, it } from "node:test";
import assert from "node:assert";
import { shouldRenameServer } from "../lib/serverRename.ts";

describe("Austin", () => {
	it("Should rename if we think we are austin", () => {
		assert(shouldRenameServer("i think i am austin"));
		assert(shouldRenameServer("i think i have austin"));
	});
	it("Should rename if we are chinese austin", () => {
		assert(shouldRenameServer("我想 austin"));
		assert(shouldRenameServer("我觉得 austin"));
	});
	it("Shouldn't rename if only austin is mentioned", () => {
		assert.strictEqual(
			shouldRenameServer("austin is therefore i am"),
			false,
		);
	});
});

describe("Normal renaming", () => {
	it("Shouldn't be too quick to rename", () => {
		assert.strictEqual(
			shouldRenameServer("i think i don't have a valid message"),
			false,
		);
		assert.strictEqual(shouldRenameServer("我想 i am chinese"), false);
		assert.strictEqual(shouldRenameServer("我觉得 taine"), false);
	});
	it("Should rename if i think i have a new idea", () => {
		assert(shouldRenameServer("i think i have a new server name idea"));
	});
	it("Should rename if i think i have a chinese message", () => {
		assert(shouldRenameServer("我觉得我有 novelty"));
		assert(shouldRenameServer("我想我有 a funny server name idea"));
	});
});
