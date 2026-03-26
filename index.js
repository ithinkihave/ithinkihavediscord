import "dotenv/config.js";
import { handleKeywords } from "./lib/keywordCheck.js";
import { handleChineseChannelEnglishCheck } from "./lib/chineseCheck.js";
import { handleTruthQuestion } from "./lib/truthCheck.js";
import { handleServerRename } from "./lib/serverRename.js";
import { Client, GatewayIntentBits } from "discord.js";

const ITHINKIHAVE_SERVER_ID = "1435477855596318742";

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



// ================== discord.js events ==================

client.on("ready", (client) => {
  console.log(`yuhh ${client.user.tag} is online.`);
  console.log(new Date().toLocaleString("en-NZ"));
});

client.on("messageCreate", async (message) => {
  try {
    // Check if handling required
    if (shouldIgnoreMessage(message)) return;

    // Handle the created message
    await handleMessage(message, "create");
  } catch (error) {
    console.error("[bot] error handling created message", error);
  }
});

client.on("messageUpdate", async (oldMessage, newMessage) => {
  try {
    // Check if handling required
    const message = await hydrateMessage(newMessage);
    if (!message) return;
    if (getNormalizedContent(oldMessage) === getNormalizedContent(message)) return;
    if (shouldIgnoreMessage(message)) return;

    // Handle the updated message
    await handleMessage(message, "update");
  } catch (error) {
    console.error("[bot] error handling updated message", error);
  }
});

client.login(process.env.TOKEN);



// ================== Handlers & Helpers ==================

// Main handler function
async function handleMessage(message, eventType) {
  logMessage(message, eventType);

  // Functions
  if (await handleChineseChannelEnglishCheck(message)) return;
  await handleTruthQuestion(message);
  await handleServerRename(message);
  await handleKeywords(message);
}

// Make sure we have the full msg object
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

// Ignore messages from itself
function shouldIgnoreMessage(message) {
  return !message?.author || message.author.id === client.user.id;
}

function getNormalizedContent(message) {
  return (message?.content ?? "").toLowerCase();
}

// Log messages
function logMessage(message, eventType) {
  if (message.guild?.id === ITHINKIHAVE_SERVER_ID) {
    const prefix = eventType === "update" ? "[edited] " : "";
    console.log(`${prefix}[${message.author.tag}] ${message.content}`);
  }
}
