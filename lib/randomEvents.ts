import type { DiscordMessage } from "./messageTypes.ts";

const REACT_PROBABILITY = 1 / 2;
const MARKETPLACE_REPLIES = [
	"is this still available?",
	"can u deliver?",
	"would you take a trade for a broken ps4?",
	"i can be there in 10 mins with cash",
	"what's your lowest price",
	"if you do half price I'll come rn",
	"can u hold this til my next paycheque?",
	"will you take 5$?",
];
const REACTIONS = [
	"1486108529822662838",
	"1486109318100156426",
	"1486109354217312417",
	"1486109380150821087",
	"1486109411918479390",
	"1486109452389187604",
	"1486109486404997301",
	"1486109530118033470",
	"1486108555751985333",
];

function shouldReact(): boolean {
	// if someone wants to add this then maybe it shouldn't react to its own messages or messages in some channels? idk
	return Math.random() <= REACT_PROBABILITY;
}

export async function handleRandomEvents(
	message: DiscordMessage,
): Promise<void> {
	if (shouldReact()) {
		const reaction =
			REACTIONS[Math.floor(Math.random() * REACTIONS.length)];
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

	if (Math.random() <= REACT_PROBABILITY) {
		const reply =
			MARKETPLACE_REPLIES[
				Math.floor(Math.random() * MARKETPLACE_REPLIES.length)
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
