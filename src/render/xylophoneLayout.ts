import type { KeyName } from '../types'
import { colourForPitch, type RGB } from '../music/colours'
import { octaveOf, pitchClass } from '../music/pitch'

/**
 * Widest range across the whole corpus. Kept as a safety net for anything that
 * needs a fixed span, but NOT what the instruments display: showing every bar
 * any song might need makes each xylophone two octaves wide, when a real
 * classroom instrument is set up with just the scale the piece uses. See
 * rangeForPitches.
 */
export const MELODY_RANGE = [60, 79] as const
export const BORDUN_SOUNDING_RANGE = [48, 74] as const

const DIATONIC = [0, 2, 4, 5, 7, 9, 11]         // C D E F G A B
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B']

const TONIC_PITCH_CLASS: Record<KeyName, number> = { C: 0, D: 2, F: 5, G: 7 }

/** The five bars set out for a key: do re mi sol la. */
export function pentatonicPitchClasses(key: KeyName): number[] {
  const tonic = TONIC_PITCH_CLASS[key]
  return [0, 2, 4, 7, 9].map(step => (tonic + step) % 12).sort((a, b) => a - b)
}

export interface XylophoneBar {
  midi: number
  name: string
  /** Full display label, e.g. 'C' or 'F♯' — already carries any accidental. */
  letter: string
  /** Whole-number index along the row. Every bar sits on the same row. */
  position: number
  colour: RGB
}

/**
 * On a real Orff instrument, a student swaps the F bar out for an F♯ bar when
 * the key needs it — the two are never both in the rack at once. This mirrors
 * that: the F slot shows F♯ when the key uses it, F natural otherwise, always
 * at the same row position. B flat never appears in this songbook.
 */
export function barsForRange(lowMidi: number, highMidi: number, keyName: KeyName): XylophoneBar[] {
  const usesFSharp = pentatonicPitchClasses(keyName).includes(6)
  const bars: XylophoneBar[] = []
  let position = 0

  for (let midi = lowMidi; midi <= highMidi; midi++) {
    const pc = pitchClass(midi)

    if (pc === 5) {
      const sounding = usesFSharp ? midi + 1 : midi
      bars.push({
        midi: sounding,
        name: `${usesFSharp ? 'F#' : 'F'}${octaveOf(sounding)}`,
        letter: usesFSharp ? 'F♯' : 'F',
        position,
        colour: colourForPitch(sounding),
      })
      position++
      continue
    }

    const diatonicIndex = DIATONIC.indexOf(pc)
    if (diatonicIndex === -1) continue   // F# only ever appears via the F slot above
    const letter = LETTERS[diatonicIndex]!
    bars.push({ midi, name: `${letter}${octaveOf(midi)}`, letter, position, colour: colourForPitch(midi) })
    position++
  }

  return bars
}

/**
 * The span of bars to lay out for a given piece of music.
 *
 * One octave of the key's scale — the tonic below the lowest note up to the
 * tonic above it — which is how the instrument is actually set up in the room.
 * Music that genuinely needs more (the Levels bordun spans two octaves by
 * design) extends only as far as its highest note, rather than rounding up to
 * another full octave.
 */
export function rangeForPitches(pitches: readonly number[], key: KeyName): [number, number] {
  const sounding = pitches.filter(p => Number.isFinite(p))
  const tonic = TONIC_PITCH_CLASS[key]
  if (sounding.length === 0) {
    const low = 60 + ((tonic - 0 + 12) % 12)
    return [low, low + 12]
  }

  const lowest = Math.min(...sounding)
  const highest = Math.max(...sounding)

  // The key's tonic at or below the lowest note.
  let low = lowest - ((lowest - tonic) % 12 + 12) % 12
  // Guard against a pitch below the instrument's practical floor.
  while (low < 36) low += 12

  const oneOctave = low + 12
  return [low, Math.max(oneOctave, highest)]
}
