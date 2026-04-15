import type { DiscordMessage } from "./messageTypes.ts";
import { slangs } from "../config/slang/slang.ts";
import { templates } from "../config/slang/templates.ts";
import { questions } from "../config/slang/questions.ts";

export type Slang = {
	short: string;
	long: string;
	regex: RegExp;
};

const questionMatchers: Array<{ regex: RegExp; slang: Slang }> =
	questions.flatMap((question) =>
		slangs.map((slang) => ({
			regex: toSeperatedRegex(question.replace("$slang", slang.short)),
			slang,
		})),
	);

function getSlangResponse(text: string): string | undefined {
	const matching = slangs.filter((slang) => slang.regex.test(text));
	const slang = matching[Math.floor(Math.random() * matching.length)];
	if (slang === undefined) {
		return;
	}

	return templates[Math.floor(Math.random() * templates.length)]
		?.replace("$short", slang.short)
		?.replace("$long", slang.long);
}

function getDefinitionResponse(text: string): string | undefined {
	for (const { regex, slang } of questionMatchers) {
		if (regex.test(text)) {
			return `${slang.short} means ${slang.long}`;
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

export function toSeperatedRegex(pattern: string): RegExp {
	return new RegExp(`([^a-zA-Z\\d]|^)${pattern}([^a-zA-Z\\d]|$)`, "i");
}
