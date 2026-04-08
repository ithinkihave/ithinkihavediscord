import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeSentiment, ensureHappy } from "../lib/sentimentAnalysis.js";

describe("analyzeSentiment", () => {
  it("returns a higher score for positive text than negative text", () => {
    const positive = analyzeSentiment("I love this so much, this is amazing and wonderful");
    const negative = analyzeSentiment("I hate this, it is awful and terrible");

    assert(positive > negative);
  });

  it("returns NaN for empty content", () => {
    assert(Number.isNaN(analyzeSentiment("")));
  });
});

describe("ensureHappy", () => {
  it("deletes negative messages in the happy channel", async () => {
    let deleted = false;
    let reactedWith = null;

    const message = {
      content: "I hate this so much, this is the worst and I am miserable",
      channel: { id: "1489797249734148188" },
      async delete() {
        deleted = true;
      },
      async react(emoji) {
        reactedWith = emoji;
      },
    };

    const didDelete = await ensureHappy(message);

    assert.equal(deleted, true);
    assert.equal(reactedWith, null);
    assert.equal(didDelete, true);
  });

  it("reacts with snare emoji for positive messages in the happy channel", async () => {
    let deleted = false;
    let reactedWith = null;

    const message = {
      content: "I love this community, this is awesome and fantastic",
      channel: { id: "1489797249734148188" },
      async delete() {
        deleted = true;
      },
      async react(emoji) {
        reactedWith = emoji;
      },
    };

    const didDelete = await ensureHappy(message);

    assert.equal(deleted, false);
    assert.equal(reactedWith, "1489800033359364259");
    assert.equal(didDelete, false);
  });

  it("ignores messages outside the happy channel", async () => {
    let deleted = false;
    let reactedWith = null;

    const message = {
      content: "I hate this",
      channel: { id: "some-other-channel" },
      async delete() {
        deleted = true;
      },
      async react(emoji) {
        reactedWith = emoji;
      },
    };

    const didDelete = await ensureHappy(message);

    assert.equal(deleted, false);
    assert.equal(reactedWith, null);
    assert.equal(didDelete, false);
  });
});
