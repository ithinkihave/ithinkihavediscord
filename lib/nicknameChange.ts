import { config } from "../config.ts";
import type { DiscordMessage } from "./messageTypes.ts";

const SE_SUFFIX_REGEX = /^.+se$/i;
const INVALID_PREFIX_REGEX = /^invalid.+$/i;
const HEX_REGEX = /^0x.+$/i;
const NATHAN_PREFIX_REGEX = /^nathan.+$/i;
const SNAIL_SUFFIX_REGEX = /^.+snail$/i;

export function matchesInvalidSE(text: string): boolean {
	const content = text.trim();
	return SE_SUFFIX_REGEX.test(content) || INVALID_PREFIX_REGEX.test(content);
}

export function matchesHex(text: string): boolean {
	return HEX_REGEX.test(text.trim());
}

export function matchesNathan(text: string): boolean {
	const content = text.trim();
	return (
		NATHAN_PREFIX_REGEX.test(content) || SNAIL_SUFFIX_REGEX.test(content)
	);
}

export async function handleNicknameChanges(
	message: DiscordMessage,
): Promise<void> {
	const text = (message?.content ?? "").trim();

	if (matchesInvalidSE(text)) {
		await changeNickname(message, config.users.invalidSeUserId, text);
		return;
	}

	if (matchesHex(text)) {
		await changeNickname(message, config.users.hexperiodUserId, text);
		return;
	}

	if (matchesNathan(text)) {
		await changeNickname(message, config.users.nathansnailUserId, text);
		return;
	}
}

async function changeNickname(
	message: DiscordMessage,
	userId: string,
	nickname: string,
): Promise<void> {
	const guild = message.guild;
	if (!guild) return;

	try {
		const member = await guild.members.fetch(userId);
		await member.setNickname(nickname);
	} catch (error) {
		try {
			await message.react("❌");
		} catch (reactionError) {
			console.error(
				"[bot] error reacting to failed nickname change",
				reactionError,
			);
		}
		throw error;
	}

	try {
		await message.react("✅");
	} catch (reactionError) {
		console.error(
			"[bot] error reacting to successful nickname change",
			reactionError,
		);
	}
}
