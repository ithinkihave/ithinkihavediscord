import natural from "natural";
import type { AnyPartialMessage } from "./messageTypes.ts";
const tokenizer = new natural.WordTokenizer();
const SentimentAnalyzer = natural.SentimentAnalyzer;
const stemmer = natural.PorterStemmer;
const analyzer = new SentimentAnalyzer("English", stemmer, "afinn");

export function analyzeSentiment(text: string): number {
  const tokens = tokenizer.tokenize(text);
  const sentimentScore = analyzer.getSentiment(tokens);
  return sentimentScore;
}

// Example values for interpreting the sentiment score:
//   score > 0.5    -> Strongly Positive
//   score > 0      -> Positive
//   score === 0    -> Neutral
//   score > -0.5   -> Negative
//   score <= -0.5  -> Strongly Negative

const happyChannelId = "1489797249734148188";
const sentimentThreshold = 0.2;

function shouldEnsureHappy(message: AnyPartialMessage): boolean {
  return message.channel?.id === happyChannelId;
}

export async function ensureHappy(message: AnyPartialMessage): Promise<boolean> {
  if (!shouldEnsureHappy(message)) {
    return false;
  }

  const sentimentScore = analyzeSentiment(message.content ?? "");

  console.log(
    `[bot] sentiment score for message "${message.content}": ${sentimentScore}`,
  );

  if (sentimentScore < sentimentThreshold) {
    await message.delete();
    return true;
  }
  await message.react("1489800033359364259");
  return false;
}
