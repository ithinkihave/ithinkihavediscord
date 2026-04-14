import type { DiscordMessage } from "./messageTypes.ts";
import { slangs } from "../config/slang/slang.ts";
import { templates } from "../config/slang/templates.ts";

export type Slang = {
	short: string;
	long: string;
	regex: RegExp;
};

export function getResponses(text: string): string | undefined {
	const matching = slangs.filter((slang) => text.match(slang.regex));
	const slang = matching[Math.floor(Math.random() * matching.length)];
	if (slang === undefined) {
		return;
	}

	return templates[Math.floor(Math.random() * templates.length)]
		?.replace("$short", slang.short)
		?.replace("$long", slang.long);
}

export async function handleSlang(message: DiscordMessage): Promise<void> {
	const content = message?.content ?? "";

	const messageResponse = getResponses(content);
	if (messageResponse) {
		await message.reply(messageResponse);
	}
}
