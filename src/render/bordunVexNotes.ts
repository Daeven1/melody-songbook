import { pitchClass, octaveOf } from '../music/pitch'
import type { Duration } from '../types'

/**
 * Every bordun pitch in the songbook is a tonic or a perfect fifth in the key
 * of C, D, F or G — pitch classes {0, 2, 5, 7, 9} — and none of those combinations
 * ever needs an accidental. If a future pattern introduced one, this throws
 * rather than silently mis-spelling it.
 */
const BORDUN_NOTE_LETTERS: Partial<Record<number, string>> = {
  0: 'c', 2: 'd', 5: 'f', 7: 'g', 9: 'a',
}

export function bordunVexKey(midi: number): string {
  const letter = BORDUN_NOTE_LETTERS[pitchClass(midi)]
  if (!letter) {
    throw new Error(`Bordun pitch ${midi} is outside the songbook's tonic/fifth vocabulary`)
  }
  return `${letter}/${octaveOf(midi)}`
}

const VEX_DURATION: Record<Duration, string> = { half: 'h', quarter: 'q', eighth: '8' }

export function bordunVexDuration(duration: Duration, isRest: boolean): string {
  return isRest ? `${VEX_DURATION[duration]}r` : VEX_DURATION[duration]
}
