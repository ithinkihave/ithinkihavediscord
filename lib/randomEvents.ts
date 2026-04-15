import { config } from "../config.ts";
import type { DiscordMessage } from "./messageTypes.ts";

const { respondProbability, marketplaceReplies, reactions } =
	config.randomEvents;

function shouldReact(): boolean {
	// if someone wants to add this then maybe it shouldn't react to its own messages or messages in some channels? idk
	return Math.random() <= respondProbability;
}

export async function handleRandomEvents(
	message: DiscordMessage,
): Promise<void> {
	if (shouldReact()) {
		const reaction =
			reactions[Math.floor(Math.random() * reactions.length)];
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

	if (Math.random() <= respondProbability) {
		const reply =
			marketplaceReplies[
				Math.floor(Math.random() * marketplaceReplies.length)
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
