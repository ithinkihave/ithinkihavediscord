import type {
	Message,
	OmitPartialGroupDMChannel,
	PartialMessage,
} from "discord.js";

export type DiscordMessage<InGuild extends boolean = boolean> =
	OmitPartialGroupDMChannel<Message<InGuild> | PartialMessage<InGuild>>;

export type FullDiscordMessage<InGuild extends boolean = boolean> =
	OmitPartialGroupDMChannel<Message<InGuild>>;
