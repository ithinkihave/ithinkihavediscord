import { AttachmentBuilder, SlashCommandBuilder } from "discord.js";
import type {
	CommandName,
	NamedChatInputCommandInteraction,
} from "./commandTypes.ts";
import {
	addFakeCompressionArtifacts,
	renderTextOnImage,
	toSingleFrameGif,
} from "./imageText.ts";

const DEFAULT_GLUP_TEMPLATE = new URL("../img/glup.png", import.meta.url)
	.pathname;
const DEFAULT_GLUP_BOX = {
	x1: 0,
	y1: 65,
	x2: 186,
	y2: 217,
};

export const GLUP_COMMAND_NAME = "glup" satisfies CommandName;

export const glupCommandData = new SlashCommandBuilder()
	.setName(GLUP_COMMAND_NAME)
	.setDescription("Render wrapped text into the glup speech bubble")
	.addStringOption((option) =>
		option
			.setName("text")
			.setDescription("Text to place in the speech bubble")
			.setRequired(true),
	)
	.addAttachmentOption((option) =>
		option
			.setName("image")
			.setDescription("Optional custom image template"),
	)
	.toJSON();

type GlupCommandInteraction = NamedChatInputCommandInteraction<
	typeof GLUP_COMMAND_NAME
>;

export async function handleGlupCommand(interaction: GlupCommandInteraction) {
	const text = interaction.options.getString("text", true).trim();
	const attachment = interaction.options.getAttachment("image");

	if (!text) {
		await interaction.reply({
			content: "Text cannot be empty.",
			ephemeral: true,
		});
		return;
	}

	await interaction.deferReply();

	const { buffer } = await renderTextOnImage({
		source: attachment?.url ?? DEFAULT_GLUP_TEMPLATE,
		text,
		box: DEFAULT_GLUP_BOX,
		options: {
			padding: 8,
			minFontSize: 12,
			maxFontSize: 42,
			lineGap: 1.04,
			horizontalSquish: 0.94,
			fontWeight: 500,
			fill: "#111111",
			stroke: "#ffffff",
			strokeWidthRatio: 0.05,
		},
	});

	const artifacted = await addFakeCompressionArtifacts(buffer, {
		quality: 36,
		chromaSubsampling: "4:2:0",
	});

	const gifBuffer = await toSingleFrameGif(artifacted);

	await interaction.editReply({
		files: [new AttachmentBuilder(gifBuffer, { name: "glup.gif" })],
	});
}
