import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  runMessageHandlersInOrder,
  type MessageHandler,
  type RunMessageHandler,
} from "../lib/messagePipeline.ts";
import { createMockMessage } from "./mocks/message.ts";

describe("runMessageHandlersInOrder typed helper", () => {
  it("stops after a delete-capable handler reports it handled the message", async () => {
    const message = createMockMessage({ content: "hello" });
    const calls: string[] = [];

    const handlers: MessageHandler<boolean>[] = [
      {
        context: "delete first",
        handler: async (incomingMessage) => incomingMessage === message,
        stopOnResult: true,
      },
      {
        context: "should never run",
        handler: async () => {
          throw new Error("later handler should not run");
        },
      },
    ];

    const runMessageHandler: RunMessageHandler<typeof handlers> = async (
      incomingMessage,
      context,
      handler,
    ) => {
      calls.push(context);
      return {
        ok: true,
        result: await handler(incomingMessage),
      };
    };

    const handlerCheck = await runMessageHandlersInOrder(
      message,
      handlers,
      runMessageHandler,
    );

    assert.deepEqual(calls, ["delete first"]);
    assert.deepEqual(handlerCheck, { ok: true, result: true });
  });

  it("continues to later handlers when earlier handlers do not stop the pipeline", async () => {
    const message = createMockMessage({ content: "hello" });
    const calls: string[] = [];

    const handlers: MessageHandler<boolean | string>[] = [
      {
        context: "react first",
        handler: async (incomingMessage) => incomingMessage.content === "goodbye",
        stopOnResult: true,
      },
      {
        context: "reply second",
        handler: async (incomingMessage) => incomingMessage.content ?? "",
      },
    ];

    const runMessageHandler: RunMessageHandler<typeof handlers> = async (
      incomingMessage,
      context,
      handler,
    ) => {
      calls.push(context);
      return {
        ok: true,
        result: await handler(incomingMessage),
      };
    };

    const handlerCheck = await runMessageHandlersInOrder(
      message,
      handlers,
      runMessageHandler,
    );

    assert.deepEqual(calls, ["react first", "reply second"]);
    assert.deepEqual(handlerCheck, { ok: true, result: null });
  });

  it("stops when a handler reports an error", async () => {
    const message = createMockMessage({ content: "hello" });
    const calls: string[] = [];

    const handlers: MessageHandler<boolean>[] = [
      {
        context: "broken handler",
        handler: async () => false,
      },
      {
        context: "should never run",
        handler: async () => true,
        stopOnResult: true,
      },
    ];

    const runMessageHandler: RunMessageHandler<typeof handlers> = async (
      incomingMessage,
      context,
      handler,
    ) => {
      calls.push(context);

      if (context === "broken handler") {
        return {
          ok: false,
          result: null,
        };
      }

      return {
        ok: true,
        result: await handler(incomingMessage),
      };
    };

    const handlerCheck = await runMessageHandlersInOrder(
      message,
      handlers,
      runMessageHandler,
    );

    assert.deepEqual(calls, ["broken handler"]);
    assert.deepEqual(handlerCheck, { ok: false, result: null });
  });
});
