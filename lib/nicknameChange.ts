import { config } from "../config.ts";
import type { DiscordMessage } from "./messageTypes.ts";

export function findNicknameChange(text: string): string | null {
	const content = text.trim();
	for (const { userId, patterns } of config.nicknameChanges) {
		if (patterns.some((re) => re.test(content))) {
			return userId;
		}
	}
	return null;
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
