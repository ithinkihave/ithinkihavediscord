import type { ChatInputCommandInteraction } from "discord.js";

export type CommandName =
	| "gpa"
	| "glup"
	| "damnnnnn"
	| "emoji-war"
	| "version"
	| "eyescan";

export type NamedChatInputCommandInteraction<Name extends CommandName> =
	ChatInputCommandInteraction & { commandName: Name };
