import "dotenv/config.js";
import { Client, GatewayIntentBits, type ChatInputCommandInteraction } from "discord.js";
import { GPA_COMMAND_NAME, gpaCommandData, handleGpaCommand } from "./lib/gpaCheck.ts";
import { GLUP_COMMAND_NAME, glupCommandData, handleGlupCommand } from "./lib/glupCheck.ts";
import { handleMessage, hydrateMessage, shouldIgnoreMessage, getNormalizedContent, ITHINKIHAVE_SERVER_ID } from "./lib/messageHandler.ts";
import { EMOJI_WAR_COMMAND_NAME, emojiWarCommandData, handleEmojiWarCommand } from "./lib/emojiWar.ts";

type CommandHandler = (interaction: ChatInputCommandInteraction) => Promise<void>;

const commandHandlers = new Map<string, CommandHandler>([
  [GPA_COMMAND_NAME, handleGpaCommand as CommandHandler],
  [GLUP_COMMAND_NAME, handleGlupCommand as CommandHandler],
  [EMOJI_WAR_COMMAND_NAME, handleEmojiWarCommand as CommandHandler],
]);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  allowedMentions: { repliedUser: false },
});

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
    if (await shouldIgnoreMessage(message, client.user?.id)) return;
    await handleMessage(message, "messageCreate");
  } catch (error) {
    console.error("[bot] error handling created message", error);
  }
});

client.on("messageUpdate", async (oldMessage, newMessage) => {
  try {
    const message = await hydrateMessage(newMessage);
    if (!message) return;
    if (getNormalizedContent(oldMessage) === getNormalizedContent(message)) return;
    if (await shouldIgnoreMessage(message, client.user?.id)) return;
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
    const handler = commandHandlers.get(interaction.commandName);
    if (handler) {
      await handler(interaction);
    }
  } catch (error) {
    console.error(`[bot] error handling /${interaction.commandName}`, error);

    const message = "Something went wrong.";
    if (interaction.deferred || interaction.replied) {
      try {
        await interaction.editReply({ content: message, attachments: [] });
      } catch (e) {
        console.error("[bot] failed to edit reply to error", e);
      }
      return;
    }
    try {
      await interaction.reply({ content: message, ephemeral: true });
    } catch (e) {
      console.error("[bot] failed to reply with error", e);
    }
  }
});

client.login(process.env.TOKEN);

async function registerSlashCommands<Ready extends boolean = boolean>(client: Client<Ready>) {
  const guildId = process.env.COMMAND_GUILD_ID ?? ITHINKIHAVE_SERVER_ID;
  const guild = await client.guilds.fetch(guildId);

  await guild.commands.set([gpaCommandData, glupCommandData, emojiWarCommandData]);
  console.log(`[bot] registered slash commands in ${guild.name}`);
}

