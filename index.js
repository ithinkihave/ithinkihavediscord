require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");

const ITHINKIHAVE_SERVER_ID = "1435477855596318742";
const CHINESE_CHANNEL_ID = "1486174868054474762";
const ALLOWED_CHINESE_CHANNEL_CHAR_REGEX =
  /[\p{sc=Han} \n\r\u3000.,!?。，、！？…]/u;
const ALLOWED_CHINESE_CHANNEL_MENTION_REGEX = /<@!?\d+>|<@&\d+>/gu;
const HAN_CHARACTER_REGEX = /\p{sc=Han}/u;
const CHINESE_CHARACTER_RATIO_THRESHOLD = 0.5;
const ASCII_ART_MIN_NON_WHITESPACE_LENGTH = 24;
const ASCII_ART_REPEATED_CHARACTER_MIN_COUNT = 10;
const ASCII_ART_REPEATED_CHARACTER_RATIO_THRESHOLD = 0.35;
const TRUTH_CHECK_PHRASES = ["is this true", "这是真的吗", "is this real"];
const SERVER_NAME_PREFIXES = ["i think", "我觉得", "我想"];

const trueresponses = require("./res/true.json");
const falseresponses = require("./res/false.json");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageTyping,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

const responses = [
  { key: "guh", responses: ["https://tenor.com/view/guh-gif-25116077"] },
];

client.on("ready", (client) => {
  console.log(`yuhh ${client.user.tag} is online.`);
  console.log(new Date().toLocaleString("en-NZ"));
});

client.on("messageCreate", async (message) => {
  try {
    await handleMessage(message, "create");
  } catch (error) {
    console.error("[bot] error handling created message", error);
  }
});

client.on("messageUpdate", async (oldMessage, newMessage) => {
  try {
    const message = await hydrateMessage(newMessage);
    if (!message) {
      return;
    }

    if (getNormalizedContent(oldMessage) === getNormalizedContent(message)) {
      return;
    }

    await handleMessage(message, "update");
  } catch (error) {
    console.error("[bot] error handling updated message", error);
  }
});

client.login(process.env.TOKEN);

async function handleMessage(message, eventType) {
  if (shouldIgnoreMessage(message)) {
    return;
  }

  logMessage(message, eventType);

  if (await handleChineseChannelContentCheck(message)) {
    return;
  }

  if (shouldReplyToTruthQuestion(message)) {
    await replyToTruthQuestion(message);
  }

  if (shouldRenameServer(message)) {
    await renameServerFromMessage(message);
  }

  await checkForKeywords(message);
}

async function hydrateMessage(message) {
  if (!message.partial) {
    return message;
  }

  try {
    return await message.fetch();
  } catch (error) {
    console.error("[bot] error fetching updated message", error);
    return null;
  }
}

function shouldIgnoreMessage(message) {
  return !message?.author || message.author.id === client.user.id;
}

function getNormalizedContent(message) {
  return (message?.content ?? "").toLowerCase();
}

function logMessage(message, eventType) {
  if (message.guild?.id === ITHINKIHAVE_SERVER_ID) {
    const prefix = eventType === "update" ? "[edited] " : "";
    console.log(`${prefix}[${message.author.tag}] ${message.content}`);
  }
}

function shouldDeleteDisallowedChineseChannelMessage(message) {
  if (message.channel?.id !== CHINESE_CHANNEL_ID) {
    return false;
  }

  if (message.attachments.size > 0) {
    return true;
  }

  if (message.stickers.size > 0 && !(message.content ?? "").trim()) {
    return false;
  }

  return shouldDeleteChineseChannelContent(message.content ?? "");
}

function shouldDeleteChineseChannelContent(text) {
  const textWithoutMentions = text.replace(ALLOWED_CHINESE_CHANNEL_MENTION_REGEX, "");
  let chineseCharacterCount = 0;
  let countableCharacterCount = 0;

  for (const symbol of textWithoutMentions) {
    if (!ALLOWED_CHINESE_CHANNEL_CHAR_REGEX.test(symbol)) {
      return true;
    }

    if (isNeutralChineseChannelFormatting(symbol)) {
      continue;
    }

    countableCharacterCount += 1;

    if (HAN_CHARACTER_REGEX.test(symbol)) {
      chineseCharacterCount += 1;
    }
  }

  if (countableCharacterCount === 0) {
    return true;
  }

  if ((chineseCharacterCount / countableCharacterCount) < CHINESE_CHARACTER_RATIO_THRESHOLD) {
    return true;
  }

  return isSuspiciousRepeatedCharacterArt(textWithoutMentions);
}

function isNeutralChineseChannelFormatting(symbol) {
  return symbol === " " || symbol === "\n" || symbol === "\r" || symbol === "\u3000";
}

function isSuspiciousRepeatedCharacterArt(text) {
  const characterCounts = new Map();
  let nonWhitespaceCharacterCount = 0;

  for (const symbol of text) {
    if (isNeutralChineseChannelFormatting(symbol)) {
      continue;
    }

    nonWhitespaceCharacterCount += 1;
    characterCounts.set(symbol, (characterCounts.get(symbol) ?? 0) + 1);
  }

  if (nonWhitespaceCharacterCount < ASCII_ART_MIN_NON_WHITESPACE_LENGTH) {
    return false;
  }

  let maxRepeatedCharacterCount = 0;

  for (const count of characterCounts.values()) {
    if (count > maxRepeatedCharacterCount) {
      maxRepeatedCharacterCount = count;
    }
  }

  return maxRepeatedCharacterCount >= ASCII_ART_REPEATED_CHARACTER_MIN_COUNT &&
    (maxRepeatedCharacterCount / nonWhitespaceCharacterCount) >=
      ASCII_ART_REPEATED_CHARACTER_RATIO_THRESHOLD;
}

async function handleChineseChannelContentCheck(message) {
  if (!shouldDeleteDisallowedChineseChannelMessage(message)) {
    return false;
  }

  try {
    await message.delete();
    return true;
  } catch (error) {
    console.error("[bot] error deleting message in 中文 chat", error);
    return false;
  }
}

function shouldReplyToTruthQuestion(message) {
  const content = getNormalizedContent(message);
  return TRUTH_CHECK_PHRASES.some((phrase) => content.includes(phrase));
}

async function replyToTruthQuestion(message) {
  const chance = Math.random();
  const source = chance < 0.5 ? trueresponses : falseresponses;
  const randomResponse = source[Math.floor(Math.random() * source.length)];

  await message.channel.send(randomResponse);
}

function shouldRenameServer(message) {
  // this should rename the server, no matter where the message was sent
  // as long as the bot is present.

  const content = getNormalizedContent(message);
  return SERVER_NAME_PREFIXES.some((prefix) => content.startsWith(prefix));
}

async function renameServerFromMessage(message) {
  try {
    const guild = await client.guilds.fetch(ITHINKIHAVE_SERVER_ID);
    await guild.setName(getNormalizedContent(message));
    await message.react("✅");
  } catch (error) {
    console.error("[bot] error changing server name", error);
    try {
      await message.react("❌");
    } catch (reactionError) {
      console.error("[bot] error reacting to failed server rename", reactionError);
    }
  }
}

async function checkForKeywords(message) {
  const content = getNormalizedContent(message);

  for (const item of responses) {
    if (content.includes(item.key)) {
      const randomResponse =
        item.responses[Math.floor(Math.random() * item.responses.length)];
      await message.reply(randomResponse);
    }
  }
}
