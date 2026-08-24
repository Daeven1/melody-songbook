import type { Note } from '../types'
import { accidentalSymbol, noteLetter, octaveOf } from '../music/pitch'

/** Rests sit on the middle line regardless of pitch. */
export const REST_KEY = 'b/4'

const VEX_DURATION = { half: 'h', quarter: 'q', eighth: '8' } as const

/** VexFlow key string, e.g. 'f#/4'. Spelling comes from the tonal pitch class. */
export function vexKey(note: Note): string {
  if (note.pitch === null || note.tpc === null) return REST_KEY
  const letter = noteLetter(note.tpc).toLowerCase()
  const accidental = accidentalSymbol(note.tpc)
  return `${letter}${accidental}/${octaveOf(note.pitch)}`
}

export function vexDuration(note: Note): string {
  const base = VEX_DURATION[note.duration]
  return note.pitch === null ? `${base}r` : base
}
