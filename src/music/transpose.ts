import type { Bar, KeyName, Note } from '../types'

/**
 * Moving up a tone is +2 steps on the circle of fifths; up a fourth is −1; up a fifth is +1.
 * Shifting the tonal pitch class alongside the MIDI pitch is what keeps F# spelled as a
 * sharpened F rather than a flattened G.
 */
export const KEY_TRANSPOSITIONS: Record<KeyName, { semitones: number; tpcShift: number }> = {
  C: { semitones: 0, tpcShift: 0 },
  D: { semitones: 2, tpcShift: 2 },
  F: { semitones: 5, tpcShift: -1 },
  G: { semitones: 7, tpcShift: 1 },
}

export function transposeNote(note: Note, semitones: number, tpcShift: number): Note {
  return {
    ...note,
    pitch: note.pitch === null ? null : note.pitch + semitones,
    tpc: note.tpc === null ? null : note.tpc + tpcShift,
    extraPitches: note.extraPitches.map(p => p + semitones),
  }
}

export function transposeBars(bars: Bar[], semitones: number, tpcShift: number): Bar[] {
  return bars.map(bar => ({ notes: bar.notes.map(n => transposeNote(n, semitones, tpcShift)) }))
}
