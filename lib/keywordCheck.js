const responses = [
  { key: "guh", responses: ["https://tenor.com/view/guh-gif-25116077"] },
];

export function getResponses(text) {
  text = text.toLowerCase();
  const messageResponses = [];
  for (const item of responses) {
    if (text.includes(item.key)) {
      messageResponses.push(
        item.responses[Math.floor(Math.random() * item.responses.length)],
      );
    }
  }
  return messageResponses;
}

export async function handleKeywords(message) {
  const content = message?.content ?? "";

  const responses = getResponses(content);
  for (const response of responses) {
    await message.reply(response);
  }
}
