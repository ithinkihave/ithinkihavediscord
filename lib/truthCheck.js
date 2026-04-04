import trueresponses from "../res/true.json" with { type: "json" };
import falseresponses from "../res/false.json" with { type: "json" };

const TRUTH_CHECK_PHRASES = ["is this true", "这是真的吗", "is this real", "is it true that"];

export function shouldReplyToTruthQuestion(text) {
  text = text.toLowerCase();
  return TRUTH_CHECK_PHRASES.some((phrase) => text.includes(phrase));
}

export async function handleTruthQuestion(message) {
  if (!shouldReplyToTruthQuestion(message?.content ?? "")) return;

  const chance = Math.random();
  const source = chance < 0.5 ? trueresponses : falseresponses;
  const randomResponse = source[Math.floor(Math.random() * source.length)];

  await message.reply(randomResponse);
}
