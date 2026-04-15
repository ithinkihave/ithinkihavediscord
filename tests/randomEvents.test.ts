import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { config } from "../config.ts";
import { handleRandomEvents } from "../lib/randomEvents.ts";
import { createMockMessage } from "./mocks/message.ts";
import { createSequenceRandom, xoshiro128pp } from "./helpers/rng.ts";

describe("random events", () => {
	it("reacts to message", async () => {
		const reactions: string[] = [];
		const replies: string[] = [];
		// react=0 (≤ respondProbability, triggers), index=0 (first reaction),
		// reply=1 (> respondProbability, skips)
		const rng = createSequenceRandom([0, 0, 1]);
		const message = createMockMessage({
			onReact: (emoji) => {
				reactions.push(emoji);
			},
			onReply: (response) => {
				replies.push(response);
			},
		});

		await handleRandomEvents(message, rng);

		assert.deepEqual(reactions, [config.randomEvents.reactions[0]]);
		assert.deepEqual(replies, []);
	});

	it("replies to message", async () => {
		const reactions: string[] = [];
		const replies: string[] = [];
		// react=1 (> respondProbability, skips),
		// reply=0 (≤ respondProbability, triggers), index=0 (first reply)
		const rng = createSequenceRandom([1, 0, 0]);
		const message = createMockMessage({
			onReact: (emoji) => {
				reactions.push(emoji);
			},
			onReply: (response) => {
				replies.push(response);
			},
		});

		await handleRandomEvents(message, rng);

		assert.deepEqual(reactions, []);
		assert.deepEqual(replies, [config.randomEvents.marketplaceReplies[0]]);
	});

	it("produces repeatable outcomes for the same seed", async () => {
		const runWithSeed = async (seed: number) => {
			const reactions: string[] = [];
			const replies: string[] = [];
			const rng = xoshiro128pp(seed);

			for (let i = 0; i < 300; i++) {
				const message = createMockMessage({
					onReact: (emoji) => {
						reactions.push(emoji);
					},
					onReply: (response) => {
						replies.push(response);
					},
				});
				await handleRandomEvents(message, rng);
			}

			return { reactions, replies };
		};

		const first = await runWithSeed(42);
		const second = await runWithSeed(42);
		assert.deepEqual(first, second);
	});
});
