import { describe, it } from "node:test";
import assert from "node:assert";
import { shouldReplyToTruthQuestion } from "../lib/truthCheck.ts";

describe("True gifs", () => {
  it("Should answer questions", () => {
    assert(shouldReplyToTruthQuestion("is this true?"));
  });
  it("Speaks chinese", () => {
    assert(shouldReplyToTruthQuestion("这是真的吗"));
  });
  it("is real", () => {
    assert(shouldReplyToTruthQuestion("is this real"));
  });
  it("understands phrasing", () => {
    assert(shouldReplyToTruthQuestion("is it true that"));
  });
  it("Cares not for caps", () => {
    assert(shouldReplyToTruthQuestion("IS THIS TRUE?!?!?"));
  });
});
