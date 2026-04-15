/**
 * Application Configuration File
 *
 * This file contains all the hardcoded IDs used across the application to
 * make it easy to manage and update them in a single place.
 */

import trueResponses from "./config/responses/true.json" with { type: "json" };
import falseResponses from "./config/responses/false.json" with { type: "json" };
import { marketplaceReplies } from "./config/responses/marketplaceReplies.ts";
import { randomEventReactionIds } from "./config/reactions/randomEvents.ts";

const randomEventReactions = Object.values(randomEventReactionIds);

export const config = {
	/**
	 * Discord Server (Guild) configurations
	 */
	server: {
		// The main server ID where the bot operates (ithinkihave server)
		ithinkihaveGuildId: "1435477855596318742",

		// Guild IDs where the 'truth check' feature is restricted/enabled
		truthCheckRestrictedGuildIds: ["1378307576416178176"],
	},

	/**
	 * Discord Roles configurations
	 */
	roles: {
		// Role ID applied to clankers/bots or specific privileged users
		// the bot does not react to messages from users with this role
		clankerRoleId: "1435481760199610511",
	},

	/**
	 * Discord Channel configurations
	 */
	channels: {
		// The channel ID specifically used for the 'chinese check' functionality
		chineseCheckChannelId: "1486174868054474762",

		// The channel ID designated for messages deemed 'happy' by sentiment analysis
		happyChannelId: "1489797249734148188",
	},

	/**
	 * Discord Emote/Reaction configurations
	 */
	emotes: {
		// Emoji ID used to react to happy messages via sentiment analysis
		happyReactionEmoteId: "1489800033359364259",
	},

	truthCheck: {
		// random responses for true/false truth-check replies
		trueResponses,
		falseResponses,
	},

	randomEvents: {
		// chance to react and chance to reply per incoming message
		respondProbability: 1 / 100,

		// marketplace-style replies used for random message responses
		marketplaceReplies,

		// reuse existing configured reactions
		reactions: randomEventReactions,
	},
};
