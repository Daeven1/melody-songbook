import { describe, it, expect } from 'vitest'
import type { LyricSyllable } from '../../src/types'
import { lyricText } from '../../src/render/lyrics'

const syllable = (text: string, syllabic: LyricSyllable['syllabic']): LyricSyllable => ({ text, syllabic })

describe('lyricText', () => {
  it('leaves a single-syllable word untouched', () => {
    expect(lyricText(syllable('Au', 'single'))).toBe('Au')
  })

  it('leaves the end of a word untouched', () => {
    expect(lyricText(syllable('e,', 'end'))).toBe('e,')
  })

  it('adds a hyphen after the start of a mid-word syllable', () => {
    expect(lyricText(syllable('Lun', 'begin'))).toBe('Lun-')
  })

  it('adds a hyphen after a middle syllable', () => {
    expect(lyricText(syllable('mi', 'middle'))).toBe('mi-')
  })
})
