import trueresponses from "../res/true.json" with { type: "json" };
import falseresponses from "../res/false.json" with { type: "json" };
import type { DiscordMessage } from "./messageTypes.ts";
import { CategoryChannel, Guild, type GuildChannel, type GuildTextBasedChannel } from "discord.js";

const TRUTH_CHECK_PATTERNS = [
  /\bis (this|that|it) (?:(?:actually|really) )?true\b/,
  /\bis (this|that|it) (?:(?:actually|really) )?real\b/,
  /这是真的吗/,
  /真的假的/,
];
const TRUTH_CHECK_CHANNEL_NAME = "is-this-true";
const TRUTH_CHECK_RESTRICTED_GUILD_IDS = new Set(["1378307576416178176"]);

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

function isNamedTruthCheck(channel: GuildChannel | GuildTextBasedChannel): typeof channel["name"] extends string ? boolean : undefined {
  return channel.name === TRUTH_CHECK_CHANNEL_NAME;
}

function isOutsideTruthCheckChannel(message: DiscordMessage): boolean {
  if (!message.guild || !TRUTH_CHECK_RESTRICTED_GUILD_IDS.has(message.guild.id)) {
    return false;
  }

  if (message.channel.isDMBased()) {
    return false;
  }

  if ("name" in message.channel && isNamedTruthCheck(message.channel)) {
    return false;
  }

  if ("parent" in message.channel && message.channel.parent && "name" in message.channel.parent) {
    return isNamedTruthCheck(message.channel.parent);
  }

  return true;
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
