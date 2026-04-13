import type { BotMessage } from "./messageTypes.ts";

export type MessageHandler<T> = {
  context: string,
  handler: (message: BotMessage) => Promise<T>,
  stopOnResult?: true,
};

export type HandlerResult<T> = {
  ok: boolean,
  result: T,
};

export type RunMessageHandler<T extends MessageHandler<any>[]> = (message: BotMessage,
  context: string,
  handler: (message: BotMessage) => Promise<MessageHandlerReturnTypes<T>>
) => Promise<HandlerResult<MessageHandlerReturnTypes<T> | null>>;

export type MessageHandlerReturnTypes<T extends MessageHandler<any>[]> = Awaited<ReturnType<T[number]["handler"]>>;
export async function runMessageHandlersInOrder<T extends MessageHandler<any>[]>(
  message: BotMessage,
  handlers: T,
  runMessageHandler: RunMessageHandler<T>):
  Promise<HandlerResult<MessageHandlerReturnTypes<T> | null>> {
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
