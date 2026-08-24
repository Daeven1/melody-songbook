import { describe, it, expect } from 'vitest'
import songs from '../../src/data/songs.json'
import type { Song } from '../../src/types'
import { PHRASES } from '../../src/data/phrases'

const ALL = songs as unknown as Song[]

describe('phrase data', () => {
  it('covers every imported song and nothing else', () => {
    expect(Object.keys(PHRASES).sort()).toEqual(ALL.map(s => s.id).sort())
  })

  it('matches the known songs read off the book', () => {
    expect(PHRASES['good-night-sleep-tight']!.letters).toEqual(['A', 'B'])
    expect(PHRASES['frog-in-the-meadow']!.letters).toEqual(['A', 'B', 'C', 'B'])
    expect(PHRASES['mo-li-hua']!.letters).toEqual(['A', 'A', 'B', 'C'])
    expect(PHRASES['mo-li-hua']!.grouping).toEqual([2, 2, 2, 2])
  })

  for (const song of ALL) {
    it(`${song.id} — boxes account for every bar`, () => {
      const entry = PHRASES[song.id]!
      const grouping = entry.grouping ?? entry.letters.map(() => 1)
      expect(grouping).toHaveLength(entry.letters.length)
      const bars = song.keys.C.bars.length
      expect(grouping.reduce((a, b) => a + b, 0)).toBe(bars)
    })

    it(`${song.id} — letters are contiguous from A`, () => {
      const distinct = [...new Set(PHRASES[song.id]!.letters)].sort()
      const expected = distinct.map((_, i) => String.fromCharCode(65 + i))
      expect(distinct).toEqual(expected)
    })
  }
})
