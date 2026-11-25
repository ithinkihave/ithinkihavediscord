import type { ChatInputCommandInteraction } from "discord.js";

export type CommandName =
	| "gpa"
	| "glup"
	| "emoji-war"
	| "version"
	| "eyescan"
	| "wordlehint";

export type NamedChatInputCommandInteraction<Name extends CommandName> =
	ChatInputCommandInteraction & { commandName: Name };
