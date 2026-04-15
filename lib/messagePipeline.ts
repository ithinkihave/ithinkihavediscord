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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RunMessageHandler<T extends MessageHandler<any>[]> = (
	message: DiscordMessage,
	context: string,
	handler: (message: DiscordMessage) => Promise<MessageHandlerReturnTypes<T>>,
) => Promise<HandlerResult<MessageHandlerReturnTypes<T> | null>>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MessageHandlerReturnTypes<T extends MessageHandler<any>[]> =
	Awaited<ReturnType<T[number]["handler"]>>;
export async function runMessageHandlersInOrder<
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	T extends MessageHandler<any>[],
>(
	message: DiscordMessage,
	handlers: T,
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
