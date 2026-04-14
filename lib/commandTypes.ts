import type { ChatInputCommandInteraction } from "discord.js";

export type CommandName = "gpa" | "glup" | "emoji-war";

export type NamedChatInputCommandInteraction<Name extends CommandName> =
  ChatInputCommandInteraction & { commandName: Name };
