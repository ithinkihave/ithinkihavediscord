import type { BotMessage } from "../../lib/messageTypes.ts";

export type MockMessageOptions = {
  content?: string;
  channelId?: string;
  onDelete?: () => void | Promise<void>;
  onReact?: (emoji: string) => void | Promise<void>;
};

export function createMockMessage(options: MockMessageOptions = {}): BotMessage {
  return {
    content: options.content ?? "hello",
    channel: { id: options.channelId ?? "test-channel" },
    async delete() {
      await options.onDelete?.();
    },
    async react(emoji: string) {
      await options.onReact?.(emoji);
    },
  } as unknown as BotMessage;
}
