import { PermissionsBitField } from "discord.js";
import trueresponses from "../res/true.json" with { type: "json" };
import falseresponses from "../res/false.json" with { type: "json" };

const TRUTH_CHECK_PATTERNS = [
  /\bis (this|that|it) (?:(?:actually|really) )?true\b/,
  /\bis (this|that|it) (?:(?:actually|really) )?real\b/,
  /这是真的吗/,
  /真的假的/,
];

export function shouldReplyToTruthQuestion(text) {
  text = text.toLowerCase();
  const content = text.toLowerCase().replace(/\s+/g, " ").trim();
  return TRUTH_CHECK_PATTERNS.some((pattern) => pattern.test(content));
}

async function replyToReferencedMessage(message, response) {
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

async function shouldUseTruthCheckChannelOnly(message) {
  if (!message.guild) {
    return false;
  }

  const botMember =
    message.guild.members.me ?? (await message.guild.members.fetchMe().catch(() => null));

  if (!botMember) {
    return false;
  }

  const channels = await message.guild.channels.fetch();

  for (const channel of channels.values()) {
    if (!channel || channel.name !== TRUTH_CHECK_CHANNEL_NAME || !channel.isTextBased()) {
      continue;
    }

    const permissions = channel.permissionsFor(botMember);
    if (
      permissions?.has([
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
      ])
    ) {
      return message.channelId !== channel.id;
    }
  }

  return false;
}

export async function handleTruthQuestion(message) {
  if (!shouldReplyToTruthQuestion(message?.content ?? "")) return;
  if (await shouldUseTruthCheckChannelOnly(message)) return;

  const chance = Math.random();
  const source = chance < 0.5 ? trueresponses : falseresponses;
  const randomResponse = source[Math.floor(Math.random() * source.length)];

  const repliedToReference = await replyToReferencedMessage(message, randomResponse);

  if (!repliedToReference) {
    await message.reply(randomResponse);
  }
}
