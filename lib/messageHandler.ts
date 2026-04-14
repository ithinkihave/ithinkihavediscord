import { type ClientEvents } from "discord.js";
import { handleKeywords } from "./keywordCheck.ts";
import { handleChineseChannelEnglishCheck } from "./chineseCheck.ts";
import { handleTruthQuestion } from "./truthCheck.ts";
import { handleServerRename } from "./serverRename.ts";
import { ensureHappy } from "./sentimentAnalysis.ts";
import { handlePossibleChessMessage } from "./botChess.ts";
import {
	type HandlerResult,
	type MessageHandler,
	type MessageHandlerReturnTypes,
	runMessageHandlersInOrder,
} from "./messagePipeline.ts";
import type { DiscordMessage, FullDiscordMessage } from "./messageTypes.ts";
import { handleSlang } from "./slangCheck.ts";

export const ITHINKIHAVE_SERVER_ID = "1435477855596318742";
const CLANKER_ROLE_ID = "1435481760199610511";
const ERROR_IMG =
	"https://cdn.discordapp.com/attachments/1487372867153690664/1487372867350958221/IMG-20260328-WA0017.png";

export async function handleMessage<Event extends keyof ClientEvents>(
	message: DiscordMessage,
	eventType: Event,
) {
	logMessage(message, eventType);

	const handlerCheck = await runMessageHandlersInOrder(
		message,
		[
			{
				context: "error deleting message in 中文 chat",
				handler: handleChineseChannelEnglishCheck,
				stopOnResult: true,
			},
			{
				context: "error ensuring happy sentiment",
				handler: ensureHappy,
				stopOnResult: true,
			},
			{
				context: "error changing server name",
				handler: handleServerRename,
			},
			{
				context: "error handling keywords",
				handler: handleKeywords,
			},
			{
				context: "error replying to truth question",
				handler: handleTruthQuestion,
			},
			{
				context: "error considering a chess message",
				handler: handlePossibleChessMessage,
			},
			{
				context: "error handling a slang reply",
				handler: handleSlang,
			}
		],
		runMessageHandler,
	);

	if (!handlerCheck.ok || handlerCheck.result) {
		return;
	}
}

export function isFullMessage<InGuild extends boolean = boolean>(
	message: DiscordMessage<InGuild>,
): message is FullDiscordMessage<InGuild> {
	return !message.partial;
}

export async function hydrateMessage<InGuild extends boolean = boolean>(
	message: DiscordMessage<InGuild>,
): Promise<FullDiscordMessage<InGuild> | null> {
	if (isFullMessage(message)) {
		return message;
	}

	try {
		return await message.fetch();
	} catch (error) {
		console.error("[bot] error fetching updated message", error);
		return null;
	}
}

export async function shouldIgnoreMessage(
	message: DiscordMessage,
	botUserId: string | undefined,
): Promise<boolean> {
	if (!message?.author || message.author.id === botUserId) {
		return true;
	}

	if (!message.guild) {
		return false;
	}

	let member = message.member ?? null;

	if (!member) {
		try {
			member = await message.guild.members.fetch(message.author.id);
		} catch {
			member = null;
		}
	}

	return member?.roles?.cache?.has(CLANKER_ROLE_ID) ?? false;
}

export function getNormalizedContent(message: DiscordMessage): string {
	return (message?.content ?? "").toLowerCase();
}

export async function runMessageHandler<T extends MessageHandler<any>[]>(
	message: DiscordMessage,
	context: string,
	handler: (message: DiscordMessage) => Promise<MessageHandlerReturnTypes<T>>,
): Promise<HandlerResult<MessageHandlerReturnTypes<T> | null>> {
	try {
		return {
			ok: true,
			result: await handler(message),
		};
	} catch (error) {
		await reportMessageError(message, context, error);
		return {
			ok: false,
			result: null,
		};
	}
}

async function reportMessageError(
	message: DiscordMessage,
	context: string,
	error: unknown,
) {
	console.error(`[bot] ${context}`, error);

	if (typeof message?.channel?.send !== "function") {
		return;
	}

	try {
		await message.channel.send(ERROR_IMG);
	} catch (sendError) {
		console.error(
			`[bot] failed sending error image for ${context}`,
			sendError,
		);
	}
}

export function logMessage<Event extends keyof ClientEvents>(
	message: DiscordMessage,
	eventType: Event,
) {
	if (message.guild?.id === ITHINKIHAVE_SERVER_ID) {
		const prefix = eventType === "messageUpdate" ? "[edited] " : "";
		console.log(`${prefix}[${message.author?.tag}] ${message.content}`);
	}
}
