import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { config } from "../config.ts";
import {
	handleRandomEvents,
	resetRandomNumberGeneratorForTesting,
	setRandomNumberGeneratorForTesting,
	setRandomSeedForTesting,
} from "../lib/randomEvents.ts";
import { createMockMessage } from "./mocks/message.ts";

function createSequenceRandom(values: number[]): () => number {
	let index = 0;
	return () => {
		const value = values[index];
		index += 1;
		return value ?? 1;
	};
}

describe("random events", () => {
	it("reacts deterministically when RNG is controlled", async () => {
		const reactions: string[] = [];
		const replies: string[] = [];
		setRandomNumberGeneratorForTesting(createSequenceRandom([0, 0, 1]));

		try {
			const message = createMockMessage({
				onReact: (emoji) => {
					reactions.push(emoji);
				},
				onReply: (response) => {
					replies.push(response);
				},
			});

			await handleRandomEvents(message);
		} finally {
			resetRandomNumberGeneratorForTesting();
		}

		assert.deepEqual(reactions, [config.randomEvents.reactions[0]]);
		assert.deepEqual(replies, []);
	});

	it("replies deterministically when RNG is controlled", async () => {
		const reactions: string[] = [];
		const replies: string[] = [];
		setRandomNumberGeneratorForTesting(createSequenceRandom([1, 0, 0]));

		try {
			const message = createMockMessage({
				onReact: (emoji) => {
					reactions.push(emoji);
				},
				onReply: (response) => {
					replies.push(response);
				},
			});

			await handleRandomEvents(message);
		} finally {
			resetRandomNumberGeneratorForTesting();
		}

		assert.deepEqual(reactions, []);
		assert.deepEqual(replies, [config.randomEvents.marketplaceReplies[0]]);
	});

	it("produces repeatable outcomes for the same seed", async () => {
		const runWithSeed = async (seed: number) => {
			const reactions: string[] = [];
			const replies: string[] = [];
			setRandomSeedForTesting(seed);

			try {
				for (let i = 0; i < 300; i++) {
					const message = createMockMessage({
						onReact: (emoji) => {
							reactions.push(emoji);
						},
						onReply: (response) => {
							replies.push(response);
						},
					});
					await handleRandomEvents(message);
				}
			} finally {
				resetRandomNumberGeneratorForTesting();
			}

			return { reactions, replies };
		};

		const first = await runWithSeed(42);
		const second = await runWithSeed(42);
		assert.deepEqual(first, second);
	});
});
