import { config } from "../config.ts";
import type { DiscordMessage } from "./messageTypes.ts";

const { respondProbability, marketplaceReplies, reactions } =
	config.randomEvents;

export async function handleRandomEvents(
	message: DiscordMessage,
	rng: () => number = Math.random,
): Promise<void> {
	if (rng() <= respondProbability) {
		const reaction = reactions[Math.floor(rng() * reactions.length)];
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

	if (rng() <= respondProbability) {
		const reply =
			marketplaceReplies[Math.floor(rng() * marketplaceReplies.length)];
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
