import type { LyricSyllable } from '../types'

/** Mid-word syllables get a trailing hyphen, matching the printed book. */
export function lyricText(syllable: LyricSyllable): string {
  const midWord = syllable.syllabic === 'begin' || syllable.syllabic === 'middle'
  return midWord ? `${syllable.text}-` : syllable.text
}
