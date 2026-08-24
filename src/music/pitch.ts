/** Letters in fifths order, starting at tpc 13. */
const LETTERS_IN_FIFTHS = ['F', 'C', 'G', 'D', 'A', 'E', 'B'] as const

/** tpc of F natural — the anchor of the fifths cycle. */
const TPC_F_NATURAL = 13

export function pitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12
}

export function octaveOf(midi: number): number {
  return Math.floor(midi / 12) - 1
}

export function noteLetter(tpc: number): string {
  const index = (((tpc - TPC_F_NATURAL) % 7) + 7) % 7
  return LETTERS_IN_FIFTHS[index]!
}

/** 0 natural, 1 sharp, -1 flat, 2 double-sharp, -2 double-flat. */
export function alterationOf(tpc: number): number {
  return Math.floor((tpc - TPC_F_NATURAL) / 7)
}

export function accidentalSymbol(tpc: number): '' | '#' | 'b' | '##' | 'bb' {
  switch (alterationOf(tpc)) {
    case 0: return ''
    case 1: return '#'
    case -1: return 'b'
    case 2: return '##'
    case -2: return 'bb'
    default: throw new Error(`Unsupported alteration for tpc ${tpc}`)
  }
}

export function spelledName(tpc: number): string {
  return noteLetter(tpc) + accidentalSymbol(tpc)
}
