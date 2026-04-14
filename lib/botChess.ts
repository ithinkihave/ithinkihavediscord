import { config } from "../config.ts";
import type { DiscordMessage } from "./messageTypes.ts";

const REACT_PROBABILITY = 1 / 100;
const REACTIONS = config.botChess.chessReactions;

function shouldReact(): boolean {
	// if someone wants to add this then maybe it shouldn't react to its own messages or messages in some channels? idk
	return Math.random() <= REACT_PROBABILITY;
}

export async function handlePossibleChessMessage(
	message: DiscordMessage,
): Promise<void> {
	if (shouldReact()) {
		const reaction =
			REACTIONS[Math.floor(Math.random() * REACTIONS.length)];
		if (!reaction) {
			console.warn(
				"[bot] no chess reactions configured for random reaction",
			);
			return;
		}

		try {
			await message.react(reaction);
		} catch (reactionError) {
			console.error(
				"[bot] error reacting to randomly selected chess message",
				reactionError,
			);
			// we want to post the i'm tweaking rn one second image
			throw reactionError;
		}
	}
}
