import { config } from "../config.ts";
import trueresponses from "../res/true.json" with { type: "json" };
import falseresponses from "../res/false.json" with { type: "json" };
import type { DiscordMessage } from "./messageTypes.ts";

const TRUTH_CHECK_PATTERNS = [
  /\bis (this|that|it) (?:(?:actually|really) )?true\b/,
  /\bis (this|that|it) (?:(?:actually|really) )?real\b/,
  /这是真的吗/,
  /真的假的/,
];
const TRUTH_CHECK_CHANNEL_NAME = "is-this-true";
const TRUTH_CHECK_RESTRICTED_GUILD_IDS = new Set([config.server.truthCheckRestrictedGuildIds[0]]);

export function shouldReplyToTruthQuestion(text: string): boolean {
  const content = text.toLowerCase().replace(/\s+/g, " ").trim();
  return TRUTH_CHECK_PATTERNS.some((pattern) => pattern.test(content));
}

async function replyToReferencedMessage(message: DiscordMessage, response: string) {
  if (!message?.reference?.messageId) {
    return false;
  }

  try {
    const referencedMessage = await message.fetchReference();
    await referencedMessage.reply(response);
    return true;
  } catch (error) {
    console.error("[bot] error replying to referenced message for truth question", error);
    return false;
  }
}

function isOutsideTruthCheckChannel(message: DiscordMessage): boolean {
  if (!message.guild || !TRUTH_CHECK_RESTRICTED_GUILD_IDS.has(message.guild?.id)) {
    return false;
  }

  // We can't get proper type safety here without runtime checks :/
  if ((message.channel as {name?: string})?.name === TRUTH_CHECK_CHANNEL_NAME) {
    return false;
  }

  return (message.channel as {parent?: {name?: string}})?.parent?.name !== TRUTH_CHECK_CHANNEL_NAME;
}

export async function handleTruthQuestion(message: DiscordMessage): Promise<void> {
  if (!shouldReplyToTruthQuestion(message?.content ?? "")) return;
  if (isOutsideTruthCheckChannel(message)) return;

  const chance = Math.random();
  const source = chance < 0.5 ? trueresponses : falseresponses;
  const randomResponse = source[Math.floor(Math.random() * source.length)];
  if (!randomResponse) {
    return;
  }

  const repliedToReference = await replyToReferencedMessage(message, randomResponse);

  if (!repliedToReference) {
    await message.reply(randomResponse);
  }
}
