import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runMessageHandlersInOrder } from "../lib/messagePipeline.js";
import { AnyPartialMessage } from "../index.js";

describe("runMessageHandlersInOrder", () => {
  it("stops after a delete-capable handler reports it handled the message", async () => {
    const message = { content: "hello" } as AnyPartialMessage; // a bit evil
    const calls: string[] = [];

    async function runMessageHandler(_message, context, handler) {
      calls.push(context);
      return {
        ok: true,
        result: await handler(_message),
      };
    }

    const handlerCheck = await runMessageHandlersInOrder(
      message,
      [
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
      ],
      runMessageHandler,
    );

    assert.deepEqual(calls, ["delete first"]);
    assert.deepEqual(handlerCheck, { ok: true, result: true });
  });

  it("continues to later handlers when earlier handlers do not stop the pipeline", async () => {
    const message = { content: "hello" } as AnyPartialMessage;
    const calls: string[] = [];

    async function runMessageHandler(_message, context, handler) {
      calls.push(context);
      return {
        ok: true,
        result: await handler(_message),
      };
    }

    const handlerCheck = await runMessageHandlersInOrder(
      message,
      [
        {
          context: "react first",
          handler: async (incomingMessage) => incomingMessage.content === "goodbye",
          stopOnResult: true,
        },
        {
          context: "reply second",
          handler: async (incomingMessage) => incomingMessage.content,
        },
      ],
      runMessageHandler,
    );

    assert.deepEqual(calls, ["react first", "reply second"]);
    assert.deepEqual(handlerCheck, { ok: true, result: null });
  });

  it("stops when a handler reports an error", async () => {
    const message = { content: "hello" } as AnyPartialMessage;
    const calls: string[] = [];

    async function runMessageHandler(_message, context, handler) {
      calls.push(context);

      if (context === "broken handler") {
        return {
          ok: false,
          result: null,
        };
      }

      return {
        ok: true,
        result: await handler(_message),
      };
    }

    const handlerCheck = await runMessageHandlersInOrder(
      message,
      [
        {
          context: "broken handler",
          handler: async () => false,
        },
        {
          context: "should never run",
          handler: async () => true,
          stopOnResult: true,
        },
      ],
      runMessageHandler,
    );

    assert.deepEqual(calls, ["broken handler"]);
    assert.deepEqual(handlerCheck, { ok: false, result: null });
  });
});
