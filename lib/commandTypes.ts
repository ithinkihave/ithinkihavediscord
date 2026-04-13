import type { ChatInputCommandInteraction } from "discord.js";

export type CommandName = "gpa" | "glup" | "emoji-war";

export type NamedChatInputCommandInteraction<Name extends CommandName> =
  ChatInputCommandInteraction & { commandName: Name };

function isNamedCommandInteraction<Name extends CommandName>(
  interaction: ChatInputCommandInteraction,
  commandName: Name,
): interaction is NamedChatInputCommandInteraction<Name> {
  return interaction.commandName === commandName;
}

export type NamedChatInputCommandInteractionHandler<Name extends CommandName> = {
  name: Name,
  handler: (interaction: NamedChatInputCommandInteraction<Name>) => Promise<void>
}

export async function handleNamedCommandInteraction(interaction: ChatInputCommandInteraction, handlers: NamedChatInputCommandInteractionHandler<any>[]): Promise<void> {
  for (const handler of handlers) {
    if (isNamedCommandInteraction(interaction, handler.name)) {
      return handler.handler(interaction);
    }
  }
}
