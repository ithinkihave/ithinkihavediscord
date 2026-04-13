import { AttachmentBuilder, MessagePayload, SlashCommandBuilder } from "discord.js";
import type { CommandName, NamedChatInputCommandInteraction } from "./commandTypes.ts";

type WarPiece = number & { readonly __brand: "WarPiece" }
type Array<T, N extends number, Acc extends T[] = []> = (Acc["length"] extends N ? Acc : Array<T, N, [...Acc, T]>) & T[];
type PieceMapping = { [piece: WarPiece]: string }

const BOARD_BASE_PERCENT = 20;
const BOARD_UPDATE_PERCENT = 20;

export class WarBoard<Size extends number> {
  board: Array<Array<WarPiece, Size>, Size>;
  piece_mapping: PieceMapping;
  size: Size;
  num_pieces: number;

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
    this.num_pieces = pieces.length;
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
    const first = this.board[0][0];
    return this.#getPieceCount(first) == this.size * this.size;
  }

  #updateEdge() {
    const size = this.board.length - 1;
    const [row, col] = [Math.floor(Math.random() * size), Math.floor(Math.random() * size)];
    const [dy, dx] = Math.random() > 0.5 ? [1, 0] : [0, 1];
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
    // we assume BOARD_BASE_PERCENT% of the board is each no matter what to prevent games from lasting too long
    const as = this.#getPieceCount(a) + this.size * this.size * BOARD_BASE_PERCENT / 100 / this.num_pieces;
    const bs = this.#getPieceCount(b) + this.size * this.size * BOARD_BASE_PERCENT / 100 / this.num_pieces;
    // if there are few b then a is less likely to win
    return (bs) / (as + bs)
  }

  #getPieceCount(count_piece: WarPiece) {
    return this.board.reduce((acc, row, _) => acc + row.filter((piece) => piece == count_piece).reduce((acc, _, _i) => acc + 1, 0), 0);
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
  const emojis = interaction.options.getString("emojis", true).trim().split(",");
  const game = new WarBoard(8, emojis);

  const prefix = `Emoji war between: ${emojis.join(" - ")}\n`
  await interaction.deferReply();
  while (!game.gameFinished()) {
    interaction.editReply(prefix + game.toString());
    game.updateGame();
    await sleep(500);
  }
}
