import { PermissionsBitField } from "discord.js";
import trueresponses from "../res/true.json" with { type: "json" };
import falseresponses from "../res/false.json" with { type: "json" };

const TRUTH_CHECK_PHRASES = ["is this true", "这是真的吗", "is this real", "is it true that"];
const TRUTH_CHECK_CHANNEL_NAME = "is-this-true";

function shouldReplyToTruthQuestion(message) {
  const content = (message?.content ?? "").toLowerCase();
  return TRUTH_CHECK_PHRASES.some((phrase) => content.includes(phrase));
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
  if (!shouldReplyToTruthQuestion(message)) return;
  if (await shouldUseTruthCheckChannelOnly(message)) return;

  const chance = Math.random();
  const source = chance < 0.5 ? trueresponses : falseresponses;
  const randomResponse = source[Math.floor(Math.random() * source.length)];

  await message.reply(randomResponse);
}
