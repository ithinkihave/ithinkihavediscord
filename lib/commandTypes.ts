import type { ChatInputCommandInteraction } from "discord.js";

export type CommandName = "gpa" | "glup" | "version";

export type NamedChatInputCommandInteraction<Name extends CommandName> =
  ChatInputCommandInteraction & { commandName: Name };

export function isNamedCommandInteraction<Name extends CommandName>(
  interaction: ChatInputCommandInteraction,
  commandName: Name,
): interaction is NamedChatInputCommandInteraction<Name> {
  return interaction.commandName === commandName;
}
