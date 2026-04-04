import { describe, it } from "node:test";
import assert from "node:assert";
import { shouldRenameServer } from "../lib/serverRename.js";

describe("Austin", () => {
  it("Should rename if we think we are austin", () => {
    assert(shouldRenameServer("i think i am austin"));
  });
  it("Should rename if we are chinese austin", () => {
    assert(shouldRenameServer("我想我有 austin"));
    assert(shouldRenameServer("我觉得我有 austin"));
  });
  it("Shouldn't rename if austin is mentioned", () => {
    assert(!shouldRenameServer("austin is therefore i am"));
  });
});

describe("Normal renaming", () => {
  it("Shouldn't be too quick to rename", () => {
    assert(!shouldRenameServer("i think i don't have a valid message"));
  });
  it("Should rename if i think i have a new idea", () => {
    assert(shouldRenameServer("i think i have a new server name idea"));
  });
  it("Should rename if i think i have a chinese message", () => {
    assert(shouldRenameServer("我觉得我有 novelty"));
  });
});
