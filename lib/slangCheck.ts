import type { DiscordMessage } from "./messageTypes.ts";
import { slangs } from "../config/slang/slang.ts";
import { templates } from "../config/slang/templates.ts";
import { questions } from "../config/slang/questions.ts";

export type Slang = {
	short: string;
	long: string;
	regex: RegExp;
};

function getSlangResponse(text: string): string | undefined {
	const matching = slangs.filter((slang) => text.match(slang.regex));
	const slang = matching[Math.floor(Math.random() * matching.length)];
	if (slang === undefined) {
		return;
	}

	return templates[Math.floor(Math.random() * templates.length)]
		?.replace("$short", slang.short)
		?.replace("$long", slang.long);
}

function getDefinitionResponse(text: string): string | undefined {
	for (const question of questions) {
		for (const slang of slangs) {
			if (
				text.match(
					new RegExp(question.replace("$slang", slang.short), "gi"),
				)
			) {
				return `${slang.short} means ${slang.long}`;
			}
		}
	}
	return undefined;
}

export function getResponse(text: string): string | undefined {
	const definition = getDefinitionResponse(text);
	if (definition) {
		return definition;
	}
	return getSlangResponse(text);
}

export async function handleSlang(message: DiscordMessage): Promise<void> {
	const content = message?.content ?? "";

	const messageResponse = getResponse(content);
	if (messageResponse) {
		await message.reply(messageResponse);
	}
}
