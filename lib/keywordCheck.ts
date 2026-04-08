import type { AnyPartialMessage } from "./messageTypes.ts";

type Responses = {
  key: string,
  responses: string[]
};

const responses: Responses[] = [
  { key: "guh", responses: ["https://tenor.com/view/guh-gif-25116077"] },
];

export function getResponses(text: string): string[] {
  text = text.toLowerCase();
  const messageResponses: string[] = [];
  for (const item of responses) {
    if (text.includes(item.key)) {
      messageResponses.push(
        item.responses[Math.floor(Math.random() * item.responses.length)],
      );
    }
  }
  return messageResponses;
}

export async function handleKeywords(message: AnyPartialMessage): Promise<void> {
  const content = message?.content ?? "";

  const messageResponses = getResponses(content);
  for (const response of messageResponses) {
    await message.reply(response);
  }
}
