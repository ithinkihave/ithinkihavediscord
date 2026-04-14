import type { DiscordMessage } from "./messageTypes.ts";

type Slang = {
	short: string,
	long: string,
	regex: RegExp,
};

const slangs: Slang[] = [
	{ short: "calc", long: "calculator" },
	{ short: "cap", long: "capacitor" },
	{ short: "exam", long: "examination" },
].map(slang => {
	(slang as typeof slang & { regex: RegExp }).regex = new RegExp(`([^a-zA-Z\\d]|^)${slang.long}([^a-zA-Z\\d]|$)`, "i");
	return slang as typeof slang & { regex: RegExp };
}
);

const templates = [
	`
# DID YOU KNOW!
**$short** is short for **$long**!
`,
	`
erm... did you mean *$short*
`
];

export function getResponses(text: string): string | undefined {
	const matching = slangs.filter((slang) => text.match(slang.regex));
	const slang = matching[Math.floor(Math.random() * matching.length)];
	if (slang === undefined) {
		return;
	}

	return templates[Math.floor(Math.random() * templates.length)]?.replace("$short", slang.short)?.replace("$long", slang.long);
}

export async function handleSlang(message: DiscordMessage): Promise<void> {
	const content = message?.content ?? "";

	const messageResponse = getResponses(content);
	if (messageResponse) {
		await message.reply(messageResponse);
	}
}
