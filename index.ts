import "dotenv/config.js";
import { handleKeywords } from "./lib/keywordCheck.ts";
import { handleChineseChannelEnglishCheck } from "./lib/chineseCheck.ts";
import { handleTruthQuestion } from "./lib/truthCheck.ts";
import { handleServerRename } from "./lib/serverRename.ts";
import { gpaCommandData, handleGpaCommand } from "./lib/gpaCheck.ts";
import { glupCommandData, handleGlupCommand } from "./lib/glupCheck.ts";
import { ensureHappy } from "./lib/sentimentAnalysis.ts";
import { Client, type ClientEvents, GatewayIntentBits } from "discord.js";
import { handlePossibleChessMessage } from "./lib/botChess.ts";
import { type HandlerResult, type MessageHandler, type MessageHandlerReturnTypes, runMessageHandlersInOrder } from "./lib/messagePipeline.ts";
import type { AnyFullMessage, AnyPartialMessage } from "./lib/messageTypes.ts";

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
    await handleMessage(message, "messageCreate");
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
    await handleMessage(message, "messageUpdate");
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
async function handleMessage<Event extends keyof ClientEvents>(message: AnyPartialMessage, eventType: Event) {
  logMessage(message, eventType);

  // Handle delete-capable checks first so a deleted message does not trigger
  // later replies or reactions. Reply handlers run before the random chess
  // reaction so a transient reaction failure does not suppress replies.

  const handlerCheck = await runMessageHandlersInOrder(
    message,
    [
      {
        context: "error deleting message in 中文 chat",
        handler: handleChineseChannelEnglishCheck,
        stopOnResult: true,
      },
      {
        context: "error ensuring happy sentiment",
        handler: ensureHappy,
        stopOnResult: true,
      },
      {
        context: "error changing server name",
        handler: handleServerRename,
      },
      {
        context: "error handling keywords",
        handler: handleKeywords,
      },
      {
        context: "error replying to truth question",
        handler: handleTruthQuestion,
      },
      {
        context: "error considering a chess message",
        handler: handlePossibleChessMessage,
      },
    ],
    runMessageHandler,
  );

  if (!handlerCheck.ok || handlerCheck.result) {
    return;
  }
}

async function registerSlashCommands<Ready extends boolean = boolean>(client: Client<Ready>) {
  const guildId = process.env.COMMAND_GUILD_ID ?? ITHINKIHAVE_SERVER_ID;
  const guild = await client.guilds.fetch(guildId);

  await guild.commands.set([gpaCommandData, glupCommandData]);
  console.log(`[bot] registered slash commands in ${guild.name}`);
}

function isFullMessage<InGuild extends boolean = boolean>(
  message: AnyPartialMessage<InGuild>
): message is AnyFullMessage<InGuild> {
  return !message.partial;
}

// Make sure we have the full msg object
async function hydrateMessage<InGuild extends boolean = boolean>(message: AnyPartialMessage<InGuild>): Promise<AnyFullMessage<InGuild> | null> {
  if (isFullMessage(message)) {
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
async function shouldIgnoreMessage(message: AnyPartialMessage): Promise<boolean> {
  if (!message?.author || message.author.id === client.user?.id) {
    return true;
  }

  if (!message.guild) {
    return false;
  }

  const member =
    message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));

  return member?.roles?.cache?.has(CLANKER_ROLE_ID) ?? false;
}

function getNormalizedContent(message: AnyPartialMessage): string {
  return (message?.content ?? "").toLowerCase();
}

async function runMessageHandler<T extends MessageHandler<any>[]>(
  message: AnyPartialMessage,
  context: string,
  handler: (message: AnyPartialMessage) => Promise<MessageHandlerReturnTypes<T>>
): Promise<HandlerResult<MessageHandlerReturnTypes<T> | null>>
  {
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

async function reportMessageError(message: AnyPartialMessage, context: string, error: any) {
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
function logMessage<Event extends keyof ClientEvents>(message: AnyPartialMessage, eventType: Event) {
  if (message.guild?.id === ITHINKIHAVE_SERVER_ID) {
    const prefix = eventType === "messageUpdate" ? "[edited] " : "";
    console.log(`${prefix}[${message.author?.tag}] ${message.content}`);
  }
}
