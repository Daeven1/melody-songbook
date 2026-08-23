import { describe, it, expect } from 'vitest'
import songs from '../../src/data/songs.json'
import type { Song, KeyName } from '../../src/types'
import { KEY_NAMES } from '../../src/types'
import { KEY_TRANSPOSITIONS, transposeBars } from '../../src/music/transpose'
import { spelledName } from '../../src/music/pitch'

const ALL = songs as unknown as Song[]

describe('key transposition rules', () => {
  it('moves up a tone, a fourth and a fifth', () => {
    expect(KEY_TRANSPOSITIONS.C).toEqual({ semitones: 0, tpcShift: 0 })
    expect(KEY_TRANSPOSITIONS.D).toEqual({ semitones: 2, tpcShift: 2 })
    expect(KEY_TRANSPOSITIONS.F).toEqual({ semitones: 5, tpcShift: -1 })
    expect(KEY_TRANSPOSITIONS.G).toEqual({ semitones: 7, tpcShift: 1 })
  })
})

describe('the authored keys agree with the transposition rules', () => {
  for (const song of ALL) {
    for (const key of KEY_NAMES) {
      it(`${song.id} — key of ${key} matches key of C transposed`, () => {
        const { semitones, tpcShift } = KEY_TRANSPOSITIONS[key as KeyName]
        expect(transposeBars(song.keys.C.bars, semitones, tpcShift)).toEqual(song.keys[key].bars)
      })
    }
  }
})

describe('spelling survives transposition', () => {
  it('spells the D-key version of a C-key F as F sharp, never G flat', () => {
    const goodnight = ALL.find(s => s.id === 'good-night-sleep-tight')!
    const names = goodnight.keys.D.bars
      .flatMap(b => b.notes)
      .filter(n => n.tpc !== null)
      .map(n => spelledName(n.tpc!))
    expect(names).toContain('F#')
    expect(names).not.toContain('Gb')
  })
})

describe('every song uses only the notes its key label sets out', () => {
  for (const song of ALL) {
    for (const key of KEY_NAMES) {
      it(`${song.id} — ${key} notes are within its labelled bars`, () => {
        const version = song.keys[key as KeyName]
        const labelled = new Set(version.label.match(/[A-G]#?/g) ?? [])
        const used = new Set(
          version.bars.flatMap(b => b.notes).filter(n => n.tpc !== null)
            .map(n => spelledName(n.tpc!)),
        )
        for (const note of used) expect(labelled).toContain(note)
      })
    }
  }
})
