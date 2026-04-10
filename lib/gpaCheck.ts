import { AttachmentBuilder, type ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { renderSingleLineTextOnImage, toSingleFrameGif } from "./imageText.ts";

const DEFAULT_GPA_TEMPLATE = new URL("../img/gpa.png", import.meta.url).pathname;

const GPA_TEXT_BOXES = [
  {
    x1: 45,
    y1: 79,
    x2: 194,
    y2: 108,
  },
  {
    x1: 45,
    y1: 151,
    x2: 194,
    y2: 180,
  },
];

export const gpaCommandData = new SlashCommandBuilder()
  .setName("gpa")
  .setDescription("Render text onto the GPA template")
  .addStringOption((option) =>
    option
      .setName("text")
      .setDescription("Text to place in the image")
      .setRequired(true),
  )
  .toJSON();

export async function handleGpaCommand(interaction: ChatInputCommandInteraction) {
  const text = interaction.options.getString("text", true).trim();

  if (!text) {
    await interaction.reply({ content: "Text cannot be empty.", ephemeral: true });
    return;
  }

  await interaction.deferReply();

  let currentBuffer: Buffer | null = null;

  for (const box of GPA_TEXT_BOXES) {
    const { buffer } = await renderSingleLineTextOnImage({
      source: currentBuffer ?? DEFAULT_GPA_TEMPLATE,
      text,
      box,
      options: {
        paddingY: 0,
        minFontSize: 10,
        maxFontSize: 64,
        horizontalSquish: 1,
        textAnchor: "start",
        fontWeight: 500,
        fill: "#111111",
        stroke: "#ffffff",
        strokeWidthRatio: 0.04,
      },
    });

    currentBuffer = buffer;
  }

  if (!currentBuffer) {
    throw new Error("GPA render did not produce an image buffer.");
  }

  const gifBuffer = await toSingleFrameGif(currentBuffer);

  await interaction.editReply({
    files: [new AttachmentBuilder(gifBuffer, { name: "gpa.gif" })],
  });
}
