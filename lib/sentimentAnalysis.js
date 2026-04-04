// const natural = require("natural");
import natural from "natural";
const tokenizer = new natural.WordTokenizer();
const SentimentAnalyzer = natural.SentimentAnalyzer;
const stemmer = natural.PorterStemmer;
const analyzer = new SentimentAnalyzer("English", stemmer, "afinn");

export function analyzeSentiment(text) {
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

function shouldEnsureHappy(message) {
  return message.channel?.id === happyChannelId;
}

export async function ensureHappy(message) {
  if (!shouldEnsureHappy(message)) {
    return;
  }

  const sentimentScore = analyzeSentiment(message.content ?? "");

  if (sentimentScore < 0.3) {
    await message.delete();
  } else {
    await message.react("😊");
  }
}
