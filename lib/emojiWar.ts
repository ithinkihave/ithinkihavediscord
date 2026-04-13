import { AttachmentBuilder, MessagePayload, SlashCommandBuilder } from "discord.js";
import type { CommandName, NamedChatInputCommandInteraction } from "./commandTypes.ts";

type WarPiece = number & { readonly __brand: "WarPiece" }
type Array<T, N extends number, Acc extends T[] = []> = (Acc["length"] extends N ? Acc : Array<T, N, [...Acc, T]>) & T[];
type PieceMapping = { [piece: WarPiece]: string }

const BOARD_BASE_PERCENT = 100;
const BOARD_UPDATE_PERCENT = 20;
const T100_UNFAIRNESS_PERCENT = 10;

export class WarBoard<Size extends number> {
  board: Array<Array<WarPiece, Size>, Size>;
  piece_mapping: PieceMapping;
  size: Size;
  turns_played: number;

  constructor(size: Size, pieces: string[]) {
    const board = array(size, (y) => array(size, (x) => {
      const [x2, y2] = [x - (size - 1) / 2, y - (size - 1) / 2];
      const theta = (Math.atan2(y2, x2) + Math.PI) % (2 * Math.PI);
      const bin = Math.floor(theta / (2 * Math.PI) * pieces.length);
      return bin as WarPiece;
    }
    ));
    this.board = board;
    this.size = size;
    this.turns_played = 0;
    this.piece_mapping = pieces.reduce((acc: PieceMapping, val, i) => {
      acc[i as WarPiece] = val;
      return acc;
    }, {})
  };

  toString(): string {
    return this.board.reduce((acc, val, _) => acc + val.reduce((acc, val, _) => acc + this.piece_mapping[val], "") + "\n", "");
  }

  updateGame() {
    for (let i = 0; i < this.size * this.size * BOARD_UPDATE_PERCENT / 100; i++) {
      this.#updateEdge();
    }
  }

  gameFinished(): boolean {
    return this.#getUniquePieceCount() == 1;
  }

  getWinner(): undefined | string {
    if (this.gameFinished()) {
      return this.piece_mapping[this.board[0][0]];
    }
    return undefined;
  }

  #updateEdge() {
    const [row, col, dy, dx] = this.#getRandomEdge();
    const [a, b] = [this.board[row]?.[col], this.board[row + dy]?.[col + dx]]
    if (a === undefined || b === undefined) {
      throw new Error("Emoji war board is corrupted");
    }
    if (Math.random() < this.#getWinRate(a, b)) {
      const board_row = this.board[row + dy];
      if (board_row === undefined) {
        throw new Error("impossible");
      }
      board_row[col + dx] = a;
    } else {
      const board_row = this.board[row];
      if (board_row === undefined) {
        throw new Error("impossible");
      }
      board_row[col] = b;
    }
  }

  // rate that a wins against b
  #getWinRate(a: WarPiece, b: WarPiece): number {
    // we assume BOARD_BASE_PERCENT% of the board is even no matter what to make games more interesting
    const piece_count = this.#getUniquePieceCount();
    const extra_per = this.size * this.size * BOARD_BASE_PERCENT / 100 / piece_count;
    const as = this.#getPieceCount(a) + extra_per;
    const bs = this.#getPieceCount(b) + extra_per;
    // if there are many a then a is more likely to win
    const unfair_winrate = (as) / (as + bs);
    const fair_winrate = 0.5;
    // if the game is taking forever make it more rigged
    const biasing_speed = -Math.log(T100_UNFAIRNESS_PERCENT / 100) / 100;
    const factor = 1 - Math.exp(-this.turns_played * biasing_speed);
    return factor * fair_winrate + (1 - factor) * unfair_winrate;
  }

  #getRandomEdge(): [row: number, col: number, dx: number, dy: number] {
    const [dy, dx] = Math.random() > 0.5 ? [1, 0] : [0, 1];
    // When dy=1 the edge spans row -> row+1, so row must be at most size-2.
    // When dx=1 the edge spans col -> col+1, so col must be at most size-2.
    const rowMax = this.size - dy;
    const colMax = this.size - dx;
    const row = Math.floor(Math.random() * rowMax);
    const col = Math.floor(Math.random() * colMax);
    return [row, col, dy, dx];
  }

  #getPieceCount(count_piece: WarPiece) {
    return this.board.reduce((acc, row, _) => acc + row.filter((piece) => piece == count_piece).reduce((acc, _, _i) => acc + 1, 0), 0);
  }

  #getUniquePieceCount(): number {
    return this.board.reduce((acc, row, _) => {
      row.reduce((acc, piece, _) => {
        acc.add(piece);
        return acc;
      }, acc);
      return acc;
    }, new Set()).size;
  }
}

function array<T, Size extends number>(length: Size, value: (idx: number) => T): Array<T, Size> {
  return Array.from({ length }, (_, idx) => value(idx)) as Array<T, Size>;
}


export const EMOJI_WAR_COMMAND_NAME = "emoji-war" satisfies CommandName;

export const emojiWarCommandData = new SlashCommandBuilder()
  .setName(EMOJI_WAR_COMMAND_NAME)
  .setDescription("Start an emoji war")
  .addStringOption((option) =>
    option
      .setName("emojis")
      .setDescription("CSV of the emojis in the war")
      .setRequired(true),
  )
  .toJSON();

type EmojiWarCommandInteraction = NamedChatInputCommandInteraction<typeof EMOJI_WAR_COMMAND_NAME>;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function handleEmojiWarCommand(interaction: EmojiWarCommandInteraction) {
  const emojis = interaction.options.getString("emojis", true).split(",").map(emoji => emoji.replace(/:.*:/, ":_:").trim());
  const game = new WarBoard(8, emojis);

  const prefix = `Emoji war between: ${emojis.join(" - ")}\n`
  await interaction.deferReply();
  while (true) {
    interaction.editReply(prefix + game.toString());
    if (game.gameFinished()) {
      break;
    }
    game.updateGame();
    await sleep(500);
  }
  const winner = game.getWinner();
  if (winner === undefined) {
    throw new Error("The winner doesn't exist");
  }
  const message = prefix + game.toString() + `\n# The winner of the war was ${winner}!`
  interaction.editReply(message);
}
