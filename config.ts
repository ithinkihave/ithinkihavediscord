/**
 * Application Configuration File
 *
 * This file contains all the hardcoded IDs used across the application to
 * make it easy to manage and update them in a single place.
 */

import trueResponses from "./config/responses/true.json" with { type: "json" };
import falseResponses from "./config/responses/false.json" with { type: "json" };

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

	/**
	 * Game/Feature configurations
	 */
	botChess: {
		// array of emoji IDs that the bot can randomly react with
		chessReactions: [
			"1486108529822662838", // blunder
			"1486109318100156426", // mistake
			"1486109284688203967", // miss
			"1486109354217312417", // inaccuracy
			"1486109380150821087", // book
			"1486109411918479390", // good
			"1486109452389187604", // excellent
			"1486109486404997301", // best
			"1486109530118033470", // great
			"1486108555751985333", // brilliant
		],
	},

	truthCheck: {
		// random responses for true/false truth-check replies
		trueResponses,
		falseResponses,
	},
};
