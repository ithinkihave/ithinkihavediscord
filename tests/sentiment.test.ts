import { config } from "../config.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeSentiment, ensureHappy } from "../lib/sentimentAnalysis.ts";
import { createMockMessage } from "./mocks/message.ts";

describe("analyzeSentiment", () => {
	it("returns a higher score for positive text than negative text", () => {
		const positive = analyzeSentiment(
			"I love this so much, this is amazing and wonderful",
		);
		const negative = analyzeSentiment(
			"I hate this, it is awful and terrible",
		);

		assert(positive > negative);
	});

	it("returns NaN for empty content", () => {
		assert(Number.isNaN(analyzeSentiment("")));
	});
});

describe("ensureHappy", () => {
	it("deletes negative messages in the happy channel", async () => {
		let deleted = false;
		let reactedWith: string | null = null;

		const message = createMockMessage({
			content:
				"I hate this so much, this is the worst and I am miserable",
			channelId: config.channels.happyChannelId,
			onDelete: () => {
				deleted = true;
			},
			onReact: (emoji) => {
				reactedWith = emoji;
			},
		});

		const didDelete = await ensureHappy(message);

		assert.equal(deleted, true);
		assert.equal(reactedWith, null);
		assert.equal(didDelete, true);
	});

	it("reacts with snare emoji for positive messages in the happy channel", async () => {
		let deleted = false;
		let reactedWith: string | null = null;

		const message = createMockMessage({
			content: "I love this community, this is awesome and fantastic",
			channelId: config.channels.happyChannelId,
			onDelete: () => {
				deleted = true;
			},
			onReact: (emoji) => {
				reactedWith = emoji;
			},
		});

		const didDelete = await ensureHappy(message);

		assert.equal(deleted, false);
		assert.equal(reactedWith, config.emotes.happyReactionEmoteId);
		assert.equal(didDelete, false);
	});

	it("ignores messages outside the happy channel", async () => {
		let deleted = false;
		let reactedWith: string | null = null;

		const message = createMockMessage({
			content: "I hate this",
			channelId: "some-other-channel",
			onDelete: () => {
				deleted = true;
			},
			onReact: (emoji) => {
				reactedWith = emoji;
			},
		});

		const didDelete = await ensureHappy(message);

		assert.equal(deleted, false);
		assert.equal(reactedWith, null);
		assert.equal(didDelete, false);
	});
});
