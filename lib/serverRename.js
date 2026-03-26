const SERVER_NAME_PREFIXES = ["i think", "我觉得", "我想"];
const ITHINKIHAVE_SERVER_ID = "1435477855596318742";

function shouldRenameServer(message) {
  // this should rename the server, no matter where the message was sent
  // as long as the bot is present.

  const content = (message?.content ?? "").toLowerCase();
  return SERVER_NAME_PREFIXES.some((prefix) => content.startsWith(prefix));
}

export async function handleServerRename(message) {
  if (!shouldRenameServer(message)) return;
  
  try {
    const guild = await message.client.guilds.fetch(ITHINKIHAVE_SERVER_ID);
    await guild.setName((message?.content ?? "").toLowerCase());
    await message.react("✅");
  } catch (error) {
    console.error("[bot] error changing server name", error);
    try {
      await message.react("❌");
    } catch (reactionError) {
      console.error("[bot] error reacting to failed server rename", reactionError);
    }
  }
}
