import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runMessageHandlersInOrder } from "../lib/messagePipeline.js";

describe("runMessageHandlersInOrder", () => {
  it("stops after a delete-capable handler reports it handled the message", async () => {
    const message = { content: "hello" };
    const calls = [];

    async function runMessageHandler(_message, context, handler) {
      calls.push(context);
      return {
        ok: true,
        result: await handler(),
      };
    }

    const handlerCheck = await runMessageHandlersInOrder(
      message,
      [
        {
          context: "delete first",
          handler: async () => true,
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
    const message = { content: "hello" };
    const calls = [];

    async function runMessageHandler(_message, context, handler) {
      calls.push(context);
      return {
        ok: true,
        result: await handler(),
      };
    }

    const handlerCheck = await runMessageHandlersInOrder(
      message,
      [
        {
          context: "react first",
          handler: async () => false,
          stopOnResult: true,
        },
        {
          context: "reply second",
          handler: async () => null,
        },
      ],
      runMessageHandler,
    );

    assert.deepEqual(calls, ["react first", "reply second"]);
    assert.deepEqual(handlerCheck, { ok: true, result: null });
  });
});
