import { fileURLToPath } from "node:url";
import {
	AttachmentBuilder,
	MessageFlags,
	SlashCommandBuilder,
} from "discord.js";
import sharp from "sharp";
import type {
	CommandName,
	NamedChatInputCommandInteraction,
} from "./commandTypes.ts";
import { downloadMedia } from "./eyeCheck/download.ts";
import { renderTextOnImage } from "./imageText.ts";

const templatePath = fileURLToPath(
	new URL("../img/damn-bird.png", import.meta.url),
);
// Keep the legs and crop the sides to match the portrait meme.
const portrait = { left: 85, top: 0, width: 491, height: 665 };
const replacementBox = { left: 63, top: 70, width: 330, height: 295 };
// Width estimates can run short for rows of wide glyphs in the fallback font.
const captionBox = { x: 83, y: 573, width: portrait.width - 166, height: 87 };

export const DAMN_BIRD_COMMAND_NAME = "damnnnnn" satisfies CommandName;

export const damnBirdCommandData = new SlashCommandBuilder()
	.setName(DAMN_BIRD_COMMAND_NAME)
	.setDescription("Make a damn bird meme")
	.addStringOption((option) =>
		option
			.setName("caption")
			.setDescription("Caption at the bottom of the image")
			.setMaxLength(120)
			.setRequired(true),
	)
	.addAttachmentOption((option) =>
		option
			.setName("image")
			.setDescription("Optional image to place over the bird's body"),
	)
	.toJSON();

async function resizeReplacement(image: Buffer) {
	return sharp(image, { limitInputPixels: 40_000_000 })
		.autoOrient()
		.resize(replacementBox.width, replacementBox.height, { fit: "inside" })
		.png()
		.toBuffer({ resolveWithObject: true });
}

export async function handleDamnBirdCommand(
	interaction: NamedChatInputCommandInteraction<
		typeof DAMN_BIRD_COMMAND_NAME
	>,
) {
	const caption = interaction.options
		.getString("caption", true)
		.replace(/\s+/gu, " ")
		.replace(/\p{Cc}/gu, "")
		.trim();
	if (!caption) {
		await interaction.reply({
			content: "Caption cannot be empty.",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const attachment = interaction.options.getAttachment("image");
	await interaction.deferReply();

	const template = sharp(templatePath).extract(portrait);
	if (attachment) {
		let replacement: Awaited<ReturnType<typeof resizeReplacement>>;
		try {
			replacement = await resizeReplacement(
				await downloadMedia(attachment.url),
			);
		} catch {
			await interaction.editReply(
				"Couldn't load that image. Try a PNG, JPEG, GIF or WebP.",
			);
			return;
		}

		template.composite([
			{
				input: replacement.data,
				left:
					replacementBox.left +
					Math.round(
						(replacementBox.width - replacement.info.width) / 2,
					),
				top:
					replacementBox.top +
					Math.round(
						(replacementBox.height - replacement.info.height) / 2,
					),
			},
		]);
	}

	const { buffer } = await renderTextOnImage({
		source: await template.png().toBuffer(),
		text: caption,
		box: captionBox,
		options: {
			padding: 16,
			minFontSize: 12,
			maxFontSize: 64,
			lineGap: 1.12,
			fontFamily: "Arial, Liberation Sans, Noto Sans, sans-serif",
			fontWeight: 500,
			fill: "#ffffff",
			stroke: "#333333",
			strokeWidthRatio: 0.035,
		},
	});

	await interaction.editReply({
		files: [new AttachmentBuilder(buffer, { name: "damnnnnn.png" })],
	});
}
