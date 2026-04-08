import { AnyPartialMessage } from "..";

const ITHINKIHAVE_SERVER_ID = "1435477855596318742";
const REQUIRED_RENAME_TERM_REGEX = /\baustin\b/;

export function shouldRenameServer(text: string): boolean {
  // this should rename the server, no matter where the message was sent
  // as long as the bot is present.

// 我想 / 我觉得 》》 both i think

  const content = text.toLowerCase().trim();

  if (
    content.startsWith("i think i have") ||
    content.startsWith("我想我有") ||
    content.startsWith("我觉得我有")
  ) { return true; }

  if (
    content.startsWith("i think") ||
    content.startsWith("我想") ||
    content.startsWith("我觉得")
  ) { return REQUIRED_RENAME_TERM_REGEX.test(content); }
  return false;
}

export async function handleServerRename(message: AnyPartialMessage): Promise<void> {
  const text = (message?.content ?? "");
  if (!shouldRenameServer(text)) return;

  try {
    const guild = await message.client.guilds.fetch(ITHINKIHAVE_SERVER_ID);
    await guild.setName(text.toLowerCase());
  } catch (error) {
    try {
      await message.react("❌");
    } catch (reactionError) {
      console.error("[bot] error reacting to failed server rename", reactionError);
    }
    // throw an error so that we can still get an image
    throw error;
  }

  try {
    await message.react("✅");
  } catch (reactionError) {
    console.error("[bot] error reacting to successful server rename", reactionError);
  }
}
