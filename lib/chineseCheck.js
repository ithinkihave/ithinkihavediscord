const CHINESE_CHANNEL_ID = "1486174868054474762";
const ENGLISH_REGEX = /[a-zA-Z]/;

export async function handleChineseChannelEnglishCheck(message) {
  if (message.channel?.id !== CHINESE_CHANNEL_ID ||
    !ENGLISH_REGEX.test(message.content ?? "")) {
    return false;
  }

  try {
    await message.delete();
    return true;
  } catch (error) {
    console.error("[bot] error deleting message in 中文 chat", error);
    return false;
  }
}
