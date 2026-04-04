import "dotenv/config.js";
import { handleKeywords } from "./lib/keywordCheck.js";
import { handleChineseChannelEnglishCheck } from "./lib/chineseCheck.js";
import { handleTruthQuestion } from "./lib/truthCheck.js";
import { handleServerRename } from "./lib/serverRename.js";
import { gpaCommandData, handleGpaCommand } from "./lib/gpaCheck.js";
import { glupCommandData, handleGlupCommand } from "./lib/glupCheck.js";
import { ensureHappy } from "./lib/sentimentAnalysis.js";
import { Client, GatewayIntentBits } from "discord.js";

const ITHINKIHAVE_SERVER_ID = "1435477855596318742";
const CLANKER_ROLE_ID = "1435481760199610511";

const ERROR_IMG = "https://cdn.discordapp.com/attachments/1487372867153690664/1487372867350958221/IMG-20260328-WA0017.png";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageTyping,
    GatewayIntentBits.GuildMessageReactions,
  ],
  allowedMentions: { repliedUser: false },
});



// ================== discord.js events ==================

client.on("ready", (client) => {
  console.log(" ================== HELLO CHAT ================== ");
  console.log(`yuhh ${client.user.tag} is online.`);
  console.log(new Date().toLocaleString("en-NZ"));

  registerSlashCommands(client).catch((error) => {
    console.error("[bot] failed registering slash commands", error);
  });
});

client.on("messageCreate", async (message) => {
  try {
    // Check if handling required
    if (await shouldIgnoreMessage(message)) return;

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
    if (await shouldIgnoreMessage(message)) return;

    // Handle the updated message
    await handleMessage(message, "update");
  } catch (error) {
    console.error("[bot] error handling updated message", error);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  try {
    if (interaction.commandName === "gpa") {
      await handleGpaCommand(interaction);
      return;
    }

    if (interaction.commandName === "glup") {
      await handleGlupCommand(interaction);
    }
  } catch (error) {
    console.error(`[bot] error handling /${interaction.commandName}`, error);

    const message = "Something went wrong while rendering that image.";
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: message, attachments: [] }).catch(() => null);
      return;
    }

    await interaction.reply({ content: message, ephemeral: true }).catch(() => null);
  }
});

client.login(process.env.TOKEN);



// ================== Handlers & Helpers ==================

// Main handler function
async function handleMessage(message, eventType) {
  logMessage(message, eventType);

  // Functions
  const chineseChannelCheck = await runMessageHandler(
    message,
    "error deleting message in 中文 chat",
    handleChineseChannelEnglishCheck,
  );

  if (!chineseChannelCheck.ok || chineseChannelCheck.result) {
    return;
  }

  // if an error occurs, others shouldn't occur; only one image
  if (!(await runMessageHandler(message, "error replying to truth question", handleTruthQuestion)).ok) return;
  if (!(await runMessageHandler(message, "error changing server name", handleServerRename)).ok) return;
  if (!(await runMessageHandler(message, "error handling keywords", handleKeywords)).ok) return;
  if (!(await runMessageHandler(message, "error ensuring happy sentiment", ensureHappy)).ok) return;
}

async function registerSlashCommands(client) {
  const guildId = process.env.COMMAND_GUILD_ID ?? ITHINKIHAVE_SERVER_ID;
  const guild = await client.guilds.fetch(guildId);

  await guild.commands.set([gpaCommandData, glupCommandData]);
  console.log(`[bot] registered slash commands in ${guild.name}`);
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

// Ignore messages from itself and internal bookkeeping accounts.
async function shouldIgnoreMessage(message) {
  if (!message?.author || message.author.id === client.user.id) {
    return true;
  }

  if (!message.guild) {
    return false;
  }

  const member =
    message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));

  return member?.roles?.cache?.has(CLANKER_ROLE_ID) ?? false;
}

function getNormalizedContent(message) {
  return (message?.content ?? "").toLowerCase();
}

async function runMessageHandler(message, context, handler) {
  try {
    return {
      ok: true,
      result: await handler(message),
    };
  } catch (error) {
    await reportMessageError(message, context, error);
    return {
      ok: false,
      result: null,
    };
  }
}

async function reportMessageError(message, context, error) {
  console.error(`[bot] ${context}`, error);

  if (typeof message?.channel?.send !== "function") {
    return;
  }

  try {
    await message.channel.send(ERROR_IMG);
  } catch (sendError) {
    console.error(`[bot] failed sending error image for ${context}`, sendError);
  }
}

// Log messages
function logMessage(message, eventType) {
  if (message.guild?.id === ITHINKIHAVE_SERVER_ID) {
    const prefix = eventType === "update" ? "[edited] " : "";
    console.log(`${prefix}[${message.author.tag}] ${message.content}`);
  }
}
