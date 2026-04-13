type WarPiece = number & { readonly __brand: "WarPiece" }
type Array<T, N extends number, Acc extends T[] = []> = Acc["length"] extends N ? Acc : Array<T, N, [...Acc, T]>
type PieceMapping = { [piece: WarPiece]: string }
type WarBoard<Size extends number> = {
  board: Array<Array<WarPiece, Size>, Size>,
  piece_mapping: PieceMapping
}

function array<T, Size extends number>(length: Size, value: (idx: number) => T): Array<T, Size> {
  return Array.from({ length }, value) as Array<T, Size>;
}

function makeBoard<Size extends number>(length: Size, pieces: string[]): WarBoard<Size> {
  const board = array(length, (y) => array(length, (x) => {
    return x + y;
  }
  ));
  return {
    board,
    piece_mapping: pieces.reduce((acc: PieceMapping, val, i) => {
      acc[i as WarPiece] = val;
      return acc;
    }, {})
  };
}
