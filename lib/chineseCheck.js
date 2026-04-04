const CHINESE_CHANNEL_ID = "1486174868054474762";
const ALLOWED_CHINESE_CHANNEL_CHAR_REGEX =
  /[\p{sc=Han} \n\r\u3000.,!?。，、！？…]/u;
const ALLOWED_CHINESE_CHANNEL_MENTION_REGEX = /<@!?\d+>|<@&\d+>/gu;
const HAN_CHARACTER_REGEX = /\p{sc=Han}/u;
const CHINESE_CHARACTER_RATIO_THRESHOLD = 0.5;
const ASCII_ART_MIN_NON_WHITESPACE_LENGTH = 24;
const ASCII_ART_REPEATED_CHAIN_MIN_LENGTH = 4;
const ASCII_ART_REPEATED_CHARACTER_MIN_COUNT = 10;
const ASCII_ART_REPEATED_CHARACTER_RATIO_THRESHOLD = 0.35;
const ASCII_ART_MIN_LINE_COUNT = 8;
const ASCII_ART_MIN_LINE_WIDTH = 20;
const ASCII_ART_MAX_LINE_LENGTH_DELTA = 4;

function shouldDeleteDisallowedChineseChannelMessage(message) {
  if (message.channel?.id !== CHINESE_CHANNEL_ID) {
    return false;
  }

  if (message.attachments.size > 0) {
    return true;
  }

  if (message.stickers.size > 0 && !(message.content ?? "").trim()) {
    return false;
  }

  return shouldDeleteChineseChannelContent(message.content ?? "");
}

export function shouldDeleteChineseChannelContent(text) {
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

  if (hasSuspiciousLineStructure(textWithoutMentions)) {
    return true;
  }

  if (hasSuspiciousRepeatedCharacterChain(textWithoutMentions)) {
    return true;
  }

  return isSuspiciousRepeatedCharacterArt(textWithoutMentions);
}

function isNeutralChineseChannelFormatting(symbol) {
  return symbol === " " || symbol === "\n" || symbol === "\r" || symbol === "\u3000";
}

function hasSuspiciousRepeatedCharacterChain(text) {
  let nonWhitespaceCharacterCount = 0;
  let previousSymbol = "";
  let currentChainLength = 0;

  for (const symbol of text) {
    if (isNeutralChineseChannelFormatting(symbol)) {
      continue;
    }

    nonWhitespaceCharacterCount += 1;

    if (symbol === previousSymbol) {
      currentChainLength += 1;
    } else {
      previousSymbol = symbol;
      currentChainLength = 1;
    }

    if (
      nonWhitespaceCharacterCount >= ASCII_ART_MIN_NON_WHITESPACE_LENGTH &&
      currentChainLength >= ASCII_ART_REPEATED_CHAIN_MIN_LENGTH
    ) {
      return true;
    }
  }

  return false;
}

function hasSuspiciousLineStructure(text) {
  const lineLengths = [];

  for (const rawLine of text.split(/\r?\n/u)) {
    let visibleCharacterCount = 0;

    for (const symbol of rawLine) {
      if (isNeutralChineseChannelFormatting(symbol)) {
        continue;
      }

      visibleCharacterCount += 1;
    }

    if (visibleCharacterCount > 0) {
      lineLengths.push(visibleCharacterCount);
    }
  }

  if (lineLengths.length < ASCII_ART_MIN_LINE_COUNT) {
    return false;
  }

  let minLineLength = lineLengths[0];
  let maxLineLength = lineLengths[0];

  for (const lineLength of lineLengths) {
    if (lineLength < ASCII_ART_MIN_LINE_WIDTH) {
      return false;
    }

    if (lineLength < minLineLength) {
      minLineLength = lineLength;
    }

    if (lineLength > maxLineLength) {
      maxLineLength = lineLength;
    }
  }

  return (maxLineLength - minLineLength) <= ASCII_ART_MAX_LINE_LENGTH_DELTA;
}

function isSuspiciousRepeatedCharacterArt(text) {
  throw new Error("hi");
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

  await message.delete();
  return true;
}
