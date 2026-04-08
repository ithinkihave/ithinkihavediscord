import { AnyPartialMessage } from "..";

const REACT_PROBABILITY = 1 / 100;
const REACTIONS = [
  "1486108529822662838",
  "1486109318100156426",
  "1486109354217312417",
  "1486109380150821087",
  "1486109411918479390",
  "1486109452389187604",
  "1486109486404997301",
  "1486109530118033470",
  "1486108555751985333",
];

function shouldReact(): boolean {
  // if someone wants to add this then maybe it shouldn't react to its own messages or messages in some channels? idk
  return Math.random() <= REACT_PROBABILITY;
}

export async function handlePossibleChessMessage(message: AnyPartialMessage): Promise<void> {
  if (shouldReact()) {
    const reaction = REACTIONS[Math.floor(Math.random() * REACTIONS.length)];
    try {
      await message.react(reaction);
    } catch (reactionError) {
      console.error(
        "[bot] error reacting to randomly selected chess message",
        reactionError,
      );
      // we want to post the i'm tweaking rn one second image
      throw reactionError;
    }
  }
}
