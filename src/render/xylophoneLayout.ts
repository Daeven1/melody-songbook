import type { KeyName } from '../types'
import { colourForPitch, type RGB } from '../music/colours'
import { octaveOf, pitchClass } from '../music/pitch'

/** Measured from the generated data: every melody note falls in this range. */
export const MELODY_RANGE = [60, 79] as const

/** Bordun sounding range, i.e. written pitch plus the -24 playback shift. */
export const BORDUN_SOUNDING_RANGE = [48, 74] as const

const DIATONIC = [0, 2, 4, 5, 7, 9, 11]         // C D E F G A B
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B']

/** The only chromatic bar the songbook ever needs. B flat never appears. */
const CHROMATIC = new Map<number, { letter: string; below: number }>([
  [6, { letter: 'F', below: 5 }],               // F# sits between F and G
])

export interface XylophoneBar {
  midi: number
  name: string
  letter: string
  isChromatic: boolean
  /** Along the row. Diatonic bars are whole numbers; a chromatic bar sits at x.5. */
  position: number
  colour: RGB
}

export function barsForRange(lowMidi: number, highMidi: number): XylophoneBar[] {
  const bars: XylophoneBar[] = []
  let position = 0

  for (let midi = lowMidi; midi <= highMidi; midi++) {
    const pc = pitchClass(midi)
    const octave = octaveOf(midi)
    const diatonicIndex = DIATONIC.indexOf(pc)

    if (diatonicIndex !== -1) {
      const letter = LETTERS[diatonicIndex]!
      bars.push({
        midi, letter, name: `${letter}${octave}`,
        isChromatic: false, position, colour: colourForPitch(midi),
      })
      position++
      continue
    }

    const chromatic = CHROMATIC.get(pc)
    if (!chromatic) continue                     // a pitch the songbook never uses

    // Raised bars sit above the gap between the diatonic bar below and the next.
    let belowPosition: number | undefined
    for (let i = bars.length - 1; i >= 0; i--) {
      const candidate = bars[i]!
      if (!candidate.isChromatic && pitchClass(candidate.midi) === chromatic.below) {
        belowPosition = candidate.position
        break
      }
    }
    if (belowPosition === undefined) continue     // its lower neighbour is out of range
    bars.push({
      midi, letter: chromatic.letter, name: `${chromatic.letter}#${octave}`,
      isChromatic: true, position: belowPosition + 0.5, colour: colourForPitch(midi),
    })
  }

  return bars.sort((a, b) => a.position - b.position)
}

const TONIC_PITCH_CLASS: Record<KeyName, number> = { C: 0, D: 2, F: 5, G: 7 }

/** The five bars set out for a key: do re mi sol la. */
export function pentatonicPitchClasses(key: KeyName): number[] {
  const tonic = TONIC_PITCH_CLASS[key]
  return [0, 2, 4, 7, 9].map(step => (tonic + step) % 12).sort((a, b) => a - b)
}
