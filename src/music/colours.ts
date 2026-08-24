import { pitchClass } from './pitch'

export type RGB = readonly [number, number, number]

const PITCH_CLASS_NAMES = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B',
] as const

/**
 * Boomwhacker colours, harvested from Lacie's MuseScore files. Every note in the
 * corpus (~2,000) agrees with this table; the importer asserts it on every import
 * so a future edit that breaks the convention fails the build.
 */
export const PITCH_COLOURS: Readonly<Record<number, RGB>> = {
  0: [226, 28, 72],    // C
  2: [249, 157, 28],   // D
  4: [255, 243, 43],   // E
  5: [188, 216, 95],   // F
  6: [98, 188, 71],    // F#
  7: [0, 156, 149],    // G
  9: [94, 80, 161],    // A
  10: [141, 91, 166],  // Bb
  11: [207, 62, 150],  // B
}

export function colourForPitch(midi: number): RGB {
  const pc = pitchClass(midi)
  const colour = PITCH_COLOURS[pc]
  if (!colour) {
    throw new Error(
      `No songbook colour for pitch class ${pc} (${PITCH_CLASS_NAMES[pc]}); ` +
      `the songbook never uses this note.`,
    )
  }
  return colour
}

export function rgbToCss(rgb: RGB): string {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
}
