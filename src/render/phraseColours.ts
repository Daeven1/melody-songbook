/**
 * The book's four phrase-box colours, in first-appearance order. `PHRASES` entries
 * always use contiguous letters starting at 'A' (enforced by tests/data/phrases.test.ts),
 * so this is a fixed letter -> colour lookup, not something computed per song.
 */
const LETTER_COLOURS: Readonly<Record<string, string>> = {
  A: '#FF0000',
  B: '#00B050',
  C: '#7030A0',
  D: '#0432FF',
}

export function colourForLetter(letter: string): string {
  const colour = LETTER_COLOURS[letter]
  if (!colour) {
    throw new Error(`No phrase-box colour for letter '${letter}'; the songbook only uses A-D.`)
  }
  return colour
}

/** Expands a `#rrggbb` hex colour to an `rgba()` string at the given alpha. */
export function hexToRgba(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!match) throw new Error(`Not a #rrggbb hex colour: '${hex}'`)
  const [, rHex, gHex, bHex] = match
  const r = parseInt(rHex!, 16)
  const g = parseInt(gHex!, 16)
  const b = parseInt(bHex!, 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
