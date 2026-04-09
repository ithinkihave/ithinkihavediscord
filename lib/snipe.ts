import { SlashCommandBuilder } from "discord.js";

export const snipeCommandData = new SlashCommandBuilder()
  .setName("snipe")
  .setDescription("Show the last deleted message in this channel")
  .addStringOption((option) =>
    option
      .setName("channel")
      .setDescription("Channel to read from")
      .setRequired(false),
  )
  .toJSON();
