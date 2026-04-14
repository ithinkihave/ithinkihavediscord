import { SlashCommandBuilder } from "discord.js";
import type {
	CommandName,
	NamedChatInputCommandInteraction,
} from "./commandTypes.ts";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

export const VERSION_COMMAND_NAME = "version" satisfies CommandName;

export const versionCommandData = new SlashCommandBuilder()
	.setName(VERSION_COMMAND_NAME)
	.setDescription("Get the current bot version based on git commit history")
	.toJSON();

type VersionCommandInteraction = NamedChatInputCommandInteraction<
	typeof VERSION_COMMAND_NAME
>;

export async function handleVersionCommand(
	interaction: VersionCommandInteraction,
) {
	try {
		let commitCount: string;
		let commitHash: string;

		const versionFilePath = path.join(process.cwd(), "version.json");

		if (fs.existsSync(versionFilePath)) {
			const versionData = JSON.parse(fs.readFileSync(versionFilePath, "utf8"));
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

		await interaction.reply({
			content: `commit #${commitCount} - [${commitHash}](https://github.com/InvalidSE/ithinkihave/commit/${commitHash})`,
		});
	} catch (error) {
		console.error("[bot] failed to get version info", error);
		await interaction.reply({
			content: "Could not retrieve version information.",
			ephemeral: true,
		});
	}
}
