require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");

const ITHINKIHAVE_SERVER_ID = "1435477855596318742";
const CHINESE_CHANNEL_ID = "1486174868054474762";
const ENGLISH_REGEX = /[a-zA-Z]/;
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
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

const responses = [
  { key: "guh", responses: ["https://tenor.com/view/guh-gif-25116077"] },
];

client.on("ready", (client) => {
  console.log(`yuhh ${client.user.tag} is online.`);

  // print current date nice
  console.log(new Date().toLocaleString("en-NZ"));
  console.log(new Date(2024, 11, 18, 0, 53, 0).toLocaleString("en-NZ"));
});

client.on("messageCreate", async (message) => {
  await handleMessage(message, "create");
});

client.on("messageUpdate", async (oldMessage, newMessage) => {
  const message = await hydrateMessage(newMessage);
  if (!message) {
    return;
  }

  if (getNormalizedContent(oldMessage) === getNormalizedContent(message)) {
    return;
  }

  await handleMessage(message, "update");
});

client.login(process.env.TOKEN);

async function handleMessage(message, eventType) {
  if (shouldIgnoreMessage(message)) {
    return;
  }

  logMessage(message, eventType);

  if (await handleChineseChannelEnglishCheck(message)) {
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

function shouldDeleteEnglishInChineseChat(message) {
  return (
    message.channel?.id === CHINESE_CHANNEL_ID &&
    ENGLISH_REGEX.test(message.content ?? "")
  );
}

async function handleChineseChannelEnglishCheck(message) {
  if (!shouldDeleteEnglishInChineseChat(message)) {
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
  for (const item of responses) {
    if (getNormalizedContent(message).includes(item.key)) {
      const randomResponse =
        item.responses[Math.floor(Math.random() * item.responses.length)];
      await message.reply(randomResponse);
    }
  }
}
