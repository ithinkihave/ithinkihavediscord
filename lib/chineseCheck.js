const CHINESE_CHANNEL_ID = "1486174868054474762";
const ALLOWED_CHINESE_CHANNEL_CHAR_REGEX =
  /[\p{sc=Han} \n\r\u3000.,!?。，、！？…]/u;
const ALLOWED_CHINESE_CHANNEL_MENTION_REGEX = /<@!?\d+>|<@&\d+>/gu;
const HAN_CHARACTER_REGEX = /\p{sc=Han}/u;
const CHINESE_CHARACTER_RATIO_THRESHOLD = 0.5;
const ASCII_ART_MIN_NON_WHITESPACE_LENGTH = 24;
const ASCII_ART_REPEATED_CHARACTER_MIN_COUNT = 10;
const ASCII_ART_REPEATED_CHARACTER_RATIO_THRESHOLD = 0.35;

function shouldDeleteDisallowedChineseChannelMessage(message) {
  if (message.channel?.id !== CHINESE_CHANNEL_ID) {
    return false;
  }

  if (message.attachments.size > 0) {
    return true;
  }

  if (message.stickers.size > 0) {
    return false;
  }

  return shouldDeleteChineseChannelContent(message.content ?? "");
}

function shouldDeleteChineseChannelContent(text) {
  const textWithoutMentions = text.replace(ALLOWED_CHINESE_CHANNEL_MENTION_REGEX, "");
  let chineseCharacterCount = 0;
  let countableCharacterCount = 0;

  for (const symbol of textWithoutMentions) {
    if (!ALLOWED_CHINESE_CHANNEL_CHAR_REGEX.test(symbol)) {
      return true;
    }

    if (isNeutralChineseChannelFormatting(symbol)) {
      continue;
    }

    countableCharacterCount += 1;

    if (HAN_CHARACTER_REGEX.test(symbol)) {
      chineseCharacterCount += 1;
    }
  }

  if (countableCharacterCount === 0) {
    return true;
  }

  if ((chineseCharacterCount / countableCharacterCount) < CHINESE_CHARACTER_RATIO_THRESHOLD) {
    return true;
  }

  return isSuspiciousRepeatedCharacterArt(textWithoutMentions);
}

function isNeutralChineseChannelFormatting(symbol) {
  return symbol === " " || symbol === "\n" || symbol === "\r" || symbol === "\u3000";
}

function isSuspiciousRepeatedCharacterArt(text) {
  const characterCounts = new Map();
  let nonWhitespaceCharacterCount = 0;

  for (const symbol of text) {
    if (isNeutralChineseChannelFormatting(symbol)) {
      continue;
    }

    nonWhitespaceCharacterCount += 1;
    characterCounts.set(symbol, (characterCounts.get(symbol) ?? 0) + 1);
  }

  if (nonWhitespaceCharacterCount < ASCII_ART_MIN_NON_WHITESPACE_LENGTH) {
    return false;
  }

  let maxRepeatedCharacterCount = 0;

  for (const count of characterCounts.values()) {
    if (count > maxRepeatedCharacterCount) {
      maxRepeatedCharacterCount = count;
    }
  }

  return maxRepeatedCharacterCount >= ASCII_ART_REPEATED_CHARACTER_MIN_COUNT &&
    (maxRepeatedCharacterCount / nonWhitespaceCharacterCount) >=
      ASCII_ART_REPEATED_CHARACTER_RATIO_THRESHOLD;
}

export async function handleChineseChannelEnglishCheck(message) {
  if (!shouldDeleteDisallowedChineseChannelMessage(message)) {
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
