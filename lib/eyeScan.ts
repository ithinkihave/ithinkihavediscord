import { AttachmentBuilder, SlashCommandBuilder } from "discord.js";
import sharp from "sharp";
import type {
	CommandName,
	NamedChatInputCommandInteraction,
} from "./commandTypes.ts";
import { type EyeMatch, scanMediaUrl } from "./eyeCheck/index.ts";

const BOX_COLOR = "#fee75c";
const BOX_PADDING = 4;

export const EYESCAN_COMMAND_NAME = "eyescan" satisfies CommandName;

export const eyescanCommandData = new SlashCommandBuilder()
	.setName(EYESCAN_COMMAND_NAME)
	.setDescription("Check media for 👀 before risking the eyes channel")
	.addAttachmentOption((option) =>
		option
			.setName("media")
			.setDescription("Image, gif or video to scan")
			.setRequired(true),
	)
	.toJSON();

type EyescanCommandInteraction = NamedChatInputCommandInteraction<
	typeof EYESCAN_COMMAND_NAME
>;

export async function handleEyescanCommand(
	interaction: EyescanCommandInteraction,
) {
	const attachment = interaction.options.getAttachment("media", true);
	await interaction.deferReply();

	const scan = await scanMediaUrl(
		attachment.url,
		attachment.contentType ?? null,
		{ includeFrame: true },
	);

	if (!scan) {
		await interaction.editReply("That's not an image, gif or video.");
		return;
	}

	const { match } = scan;
	if (!match) {
		await interaction.editReply(
			"No 👀 found. This would not survive the eyes channel 🔥",
		);
		return;
	}

	const confidence = `${Math.round(match.correlation * 100)}% match`;
	const where = match.frameIndex > 0 ? `, frame ${match.frameIndex + 1}` : "";
	const annotated = match.frame ? await drawMatch(match) : null;

	await interaction.editReply({
		content: `👀 found (${confidence}${where}). Safe to post.`,
		files: annotated
			? [new AttachmentBuilder(annotated, { name: "eyescan.png" })]
			: [],
	});
}

/** The frame the eyes were found in, with a box around them. */
export async function drawMatch(match: EyeMatch): Promise<Buffer | null> {
	const { frame } = match;
	if (!frame) {
		return null;
	}

	// bbox is in source pixels; the returned frame may have been scaled down
	const scale = frame.width / match.sourceWidth;
	const x = Math.max(0, match.bbox.x * scale - BOX_PADDING);
	const y = Math.max(0, match.bbox.y * scale - BOX_PADDING);
	const size = match.bbox.size * scale + BOX_PADDING * 2;
	const stroke = Math.max(2, Math.round(frame.width / 240));
	const fontSize = Math.max(14, Math.round(frame.width / 28));
	const label = `👀 ${Math.round(match.correlation * 100)}%`;
	const labelY =
		y > fontSize + 6 ? y - stroke - 4 : y + size + fontSize + stroke;

	const overlay = Buffer.from(
		`<svg width="${frame.width}" height="${frame.height}" xmlns="http://www.w3.org/2000/svg">
			<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="6" fill="none" stroke="#000" stroke-opacity="0.6" stroke-width="${stroke + 2}"/>
			<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="6" fill="none" stroke="${BOX_COLOR}" stroke-width="${stroke}"/>
			<text x="${x}" y="${labelY}" font-family="Noto Sans, DejaVu Sans, sans-serif" font-size="${fontSize}" font-weight="700" fill="${BOX_COLOR}" stroke="#000" stroke-width="3" paint-order="stroke">${label}</text>
		</svg>`,
	);

	return sharp(frame.rgb, {
		raw: { width: frame.width, height: frame.height, channels: 3 },
	})
		.composite([{ input: overlay }])
		.png()
		.toBuffer();
}
