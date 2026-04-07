export async function runMessageHandlersInOrder(message, handlers, runMessageHandler) {
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
