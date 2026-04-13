import type {
  Message,
  OmitPartialGroupDMChannel,
  PartialMessage,
} from "discord.js";

export type BotMessage<InGuild extends boolean = boolean> =
  OmitPartialGroupDMChannel<Message<InGuild> | PartialMessage<InGuild>>;

export type FullBotMessage<InGuild extends boolean = boolean> =
  OmitPartialGroupDMChannel<Message<InGuild>>;
