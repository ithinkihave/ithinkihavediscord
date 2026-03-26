
const responses = [
  { key: "guh", responses: ["https://tenor.com/view/guh-gif-25116077"] },
];

export async function handleKeywords(message) {
  const content = (message?.content ?? "").toLowerCase();

  for (const item of responses) {
    if (content.includes(item.key)) {
      const randomResponse =
        item.responses[Math.floor(Math.random() * item.responses.length)];
      await message.reply(randomResponse);
    }
  }
}
