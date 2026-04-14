import type { DiscordMessage } from "./messageTypes.ts";

type Responses = {
	key: string;
	responses: string[];
};

const responses: Responses[] = [
	{ key: "guh", responses: ["https://tenor.com/view/guh-gif-25116077"] },
];

export function getResponses(text: string): string[] {
	const normalizedText = text.toLowerCase();

	return responses
		.filter((item) => normalizedText.includes(item.key))
		.map(
			(item) =>
				item.responses[
					Math.floor(Math.random() * item.responses.length)
				],
		)
		.filter((response): response is string => response !== undefined);
}

export async function handleKeywords(message: DiscordMessage): Promise<void> {
	const content = message?.content ?? "";

	const messageResponses = getResponses(content);
	for (const response of messageResponses) {
		await message.reply(response);
	}
}
