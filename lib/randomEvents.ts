import { config } from "../config.ts";
import type { DiscordMessage } from "./messageTypes.ts";

const { respondProbability, marketplaceReplies, reactions } =
	config.randomEvents;
let randomNumberGenerator: () => number = Math.random;

function getRandomNumber(): number {
	return randomNumberGenerator();
}

export function setRandomSeedForTesting(seed: number): void {
	let state = seed >>> 0;

	randomNumberGenerator = () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0;
		return state / 4294967296;
	};
}

export function setRandomNumberGeneratorForTesting(random: () => number): void {
	randomNumberGenerator = random;
}

export function resetRandomNumberGeneratorForTesting(): void {
	randomNumberGenerator = Math.random;
}

function shouldReact(): boolean {
	return getRandomNumber() <= respondProbability;
}

export async function handleRandomEvents(
	message: DiscordMessage,
): Promise<void> {
	if (shouldReact()) {
		const reaction =
			reactions[Math.floor(getRandomNumber() * reactions.length)];
		if (!reaction) {
			console.warn("[bot] no reactions configured for random reaction");
		} else {
			try {
				await message.react(reaction);
			} catch (reactionError) {
				console.error(
					"[bot] error reacting to randomly selected message",
					reactionError,
				);
			}
		}
	}

	if (getRandomNumber() <= respondProbability) {
		const reply =
			marketplaceReplies[
				Math.floor(getRandomNumber() * marketplaceReplies.length)
			];
		if (!reply) return;

		try {
			await message.reply(reply);
		} catch (replyError) {
			console.error(
				"[bot] error replying to randomly selected message",
				replyError,
			);
		}
	}
}
