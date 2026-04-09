import type {
  Message,
  OmitPartialGroupDMChannel,
  PartialMessage,
} from "discord.js";

export type AnyPartialMessage<InGuild extends boolean = boolean> =
  OmitPartialGroupDMChannel<Message<InGuild> | PartialMessage<InGuild>>;

export type AnyFullMessage<InGuild extends boolean = boolean> =
  OmitPartialGroupDMChannel<Message<InGuild>>;

export type CommandName = "gpa" | "glup";
