import { config } from "../config.ts";
import type { DiscordMessage } from "./messageTypes.ts";

const MAX_NICKNAME_LENGTH = 32;

export function findNicknameChange(text: string): string | null {
	const content = text.trim();
	if ([...content].length > MAX_NICKNAME_LENGTH) return null;

	return (
		config.nicknameChanges.find(({ pattern }) => pattern.test(content))
			?.userId ?? null
	);
}

export async function handleNicknameChanges(
	message: DiscordMessage,
): Promise<void> {
	const text = (message?.content ?? "").trim();
	const userId = findNicknameChange(text);
	if (!userId) return;
	await changeNickname(message, userId, text);
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
