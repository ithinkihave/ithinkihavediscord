type WarPiece = number & { readonly __brand: "WarPiece" }
type Array<T, N extends number, Acc extends T[] = []> = (Acc["length"] extends N ? Acc : Array<T, N, [...Acc, T]>) & T[];
type PieceMapping = { [piece: WarPiece]: string }

export class WarBoard<Size extends number> {
  board: Array<Array<WarPiece, Size>, Size>;
  piece_mapping: PieceMapping;

  constructor(size: Size, pieces: string[]) {
    const board = array(size, (y) => array(size, (x) => {
      const [x2, y2] = [x - (size - 1) / 2, y - (size - 1) / 2];
      const theta = (Math.atan2(y2, x2) + Math.PI) % (2 * Math.PI);
      const bin = Math.floor(theta / (2 * Math.PI) * pieces.length);
      return bin as WarPiece;
    }
    ));
    this.board = board;
    this.piece_mapping = pieces.reduce((acc: PieceMapping, val, i) => {
      acc[i as WarPiece] = val;
      return acc;
    }, {})
  };

  toString(): string {
    return this.board.reduce((acc, val, _) => acc + val.reduce((acc, val, _) => acc + this.piece_mapping[val], "") + "\n", "");
  }
}

function array<T, Size extends number>(length: Size, value: (idx: number) => T): Array<T, Size> {
  return Array.from({ length }, (_, idx) => value(idx)) as Array<T, Size>;
}
