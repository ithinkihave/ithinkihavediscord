import { randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
	AttachmentBuilder,
	SlashCommandBuilder,
	type ChatInputCommandInteraction,
	type Message,
} from "discord.js";
import sharp from "sharp";
import { horseGifUrls } from "../config/responses/horseGifUrls.ts";
import type { CommandName } from "./commandTypes.ts";
import { downloadMedia } from "./eyeCheck/download.ts";

export const WORDLEHINT_COMMAND_NAME = "wordlehint" satisfies CommandName;
const WORDLE_BOT_ID = "1211781489931452447";
const CAPTION = "wordle hint: horse";
const CAPTION_HEIGHT = 44;
const fallbackGifs = ["gallop", "racehorse", "rotoscope"].map((name) =>
	fileURLToPath(new URL(`../img/wordlehint/${name}.gif`, import.meta.url)),
);

export const wordleHintCommandData = new SlashCommandBuilder()
	.setName(WORDLEHINT_COMMAND_NAME)
	.setDescription("Get a Wordle hint from a horse")
	.toJSON();

async function captionHorseGif(gif: Buffer): Promise<Buffer> {
	const source = sharp(gif, { animated: true, limitInputPixels: 20_000_000 });
	const { format, pages, delay } = await source.metadata();
	if (format !== "gif" || !pages || pages < 2 || pages > 150) {
		throw new Error("Expected an animated horse GIF with 2 to 150 frames");
	}

	const { data, info } = await source
		.resize({ width: 280, height: 350, fit: "inside" })
		.extend({
			top: CAPTION_HEIGHT,
			bottom: 0,
			left: 0,
			right: 0,
			background: "white",
		})
		.raw()
		.toBuffer({ resolveWithObject: true });

	const { width, height, channels, pageHeight } = info;
	if (!pageHeight) throw new Error("Missing animated GIF frame height");

	// Tile one transparent overlay across the vertical stack of GIF frames.
	const caption = Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${pageHeight}">
			<text x="${width / 2}" y="30" text-anchor="middle" font-family="sans-serif"
				font-weight="bold" font-size="${Math.min(24, Math.floor(width / 10))}">${CAPTION}</text>
		</svg>`,
	);

	return sharp(data, { raw: { width, height, channels, pageHeight } })
		.composite([{ input: caption, tile: true, gravity: "northwest" }])
		.gif({ delay, loop: 0 })
		.toBuffer();
}

async function createWordleHint() {
	const url = horseGifUrls[randomInt(horseGifUrls.length)]!;
	let gif: Buffer | string;
	try {
		gif = await captionHorseGif(await downloadMedia(url));
	} catch (error) {
		console.warn("[bot] using a bundled Wordle hint", error);
		gif = fallbackGifs[randomInt(fallbackGifs.length)]!;
	}

	return {
		files: [
			new AttachmentBuilder(gif, {
				name: "wordle-hint-horse.gif",
				description: CAPTION,
			}),
		],
	};
}

export async function handleWordleHintCommand(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply();
	await interaction.editReply(await createWordleHint());
}

export async function handleWordleHintPost(
	message: Message,
	botUserId: string | undefined,
): Promise<void> {
	if (
		message.author.id === WORDLE_BOT_ID &&
		message.author.id !== botUserId
	) {
		await message.reply(await createWordleHint());
	}
}
