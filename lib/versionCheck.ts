import { SlashCommandBuilder } from "discord.js";
import type {
	CommandName,
	NamedChatInputCommandInteraction,
} from "./commandTypes.ts";
import { execSync } from "node:child_process";
import * as fs from "node:fs";

export const VERSION_COMMAND_NAME = "version" satisfies CommandName;

export const versionCommandData = new SlashCommandBuilder()
	.setName(VERSION_COMMAND_NAME)
	.setDescription("Get the current bot version based on git commit history")
	.toJSON();

type VersionCommandInteraction = NamedChatInputCommandInteraction<
	typeof VERSION_COMMAND_NAME
>;

const VERSION_FILE_PATH = new URL("../version.json", import.meta.url);

export async function handleVersionCommand(
	interaction: VersionCommandInteraction,
) {
	try {
		await interaction.deferReply();

		let commitCount: string;
		let commitHash: string;

		if (fs.existsSync(VERSION_FILE_PATH)) {
			const versionData = JSON.parse(
				fs.readFileSync(VERSION_FILE_PATH, "utf8"),
			);
			commitCount = versionData.commitCount;
			commitHash = versionData.commitHash;
		} else {
			commitCount = execSync("git rev-list --count HEAD")
				.toString()
				.trim();
			commitHash = execSync("git rev-parse --short HEAD")
				.toString()
				.trim();
		}

		await interaction.editReply({
			content: `commit #${commitCount} - [${commitHash}](https://github.com/InvalidSE/ithinkihave/commit/${commitHash})`,
		});
	} catch (error) {
		console.error("[bot] failed to get version info", error);
		if (interaction.deferred || interaction.replied) {
			try {
				await interaction.editReply({
					content: "Could not retrieve version information.",
				});
			} catch (replyError) {
				console.error(
					"[bot] failed to edit version error reply",
					replyError,
				);
				await interaction.followUp({
					content: "Could not retrieve version information.",
					ephemeral: true,
				});
			}
			return;
		}
		await interaction.reply({
			content: "Could not retrieve version information.",
			ephemeral: true,
		});
	}
}
