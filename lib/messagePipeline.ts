import type { DiscordMessage } from "./messageTypes.ts";

export type MessageHandler<T> = {
	context: string;
	handler: (message: DiscordMessage) => Promise<T>;
	stopOnResult?: true;
};

export type HandlerResult<T> = {
	ok: boolean;
	result: T;
};

export type RunMessageHandler<T extends MessageHandler<unknown>[]> = (
	message: DiscordMessage,
	context: string,
	handler: (message: DiscordMessage) => Promise<MessageHandlerReturnTypes<T>>,
) => Promise<HandlerResult<MessageHandlerReturnTypes<T> | null>>;

export type MessageHandlerReturnTypes<T extends MessageHandler<unknown>[]> =
	Awaited<ReturnType<T[number]["handler"]>>;
export async function runMessageHandlersInOrder<
	T extends MessageHandler<unknown>[],
>(
	message: DiscordMessage,
	handlers: MessageHandler<Awaited<ReturnType<T[number]["handler"]>>>[],
	runMessageHandler: RunMessageHandler<T>,
): Promise<HandlerResult<MessageHandlerReturnTypes<T> | null>> {
	for (const { context, handler, stopOnResult } of handlers) {
		const handlerCheck = await runMessageHandler(message, context, handler);

		if (!handlerCheck.ok || (stopOnResult && handlerCheck.result)) {
			return handlerCheck;
		}
	}

	return {
		ok: true,
		result: null,
	};
}
