import { describe, it, expect } from 'vitest'
import songsJson from '../../src/data/songs.json'
import type { Note, Song } from '../../src/types'
import { vexKey, vexDuration, REST_KEY } from '../../src/render/vexNotes'

const SONGS = songsJson as unknown as Song[]
const note = (pitch: number | null, tpc: number | null, duration: Note['duration']): Note =>
  ({ pitch, tpc, extraPitches: [], duration, lyrics: [] })

describe('vexKey', () => {
  it('maps a natural to letter/octave', () => {
    expect(vexKey(note(67, 15, 'quarter'))).toBe('g/4')   // G4
    expect(vexKey(note(60, 14, 'quarter'))).toBe('c/4')   // C4, on a ledger line
  })

  it('spells a sharp as the sharpened letter, never the flattened one above', () => {
    expect(vexKey(note(66, 20, 'quarter'))).toBe('f#/4')  // F#4, not g flat
  })

  it('gives rests a fixed staff position', () => {
    expect(vexKey(note(null, null, 'quarter'))).toBe(REST_KEY)
  })
})

describe('vexDuration', () => {
  it('maps the durations the songbook uses', () => {
    expect(vexDuration(note(67, 15, 'quarter'))).toBe('q')
    expect(vexDuration(note(67, 15, 'eighth'))).toBe('8')
    expect(vexDuration(note(67, 15, 'half'))).toBe('h')
  })

  it('marks a rest', () => {
    expect(vexDuration(note(null, null, 'quarter'))).toBe('qr')
  })
})

describe('every note in the corpus maps cleanly', () => {
  it('produces a key and a duration for all of them', () => {
    for (const song of SONGS) {
      for (const version of Object.values(song.keys)) {
        for (const bar of version.bars) {
          for (const n of bar.notes) {
            expect(vexKey(n)).toMatch(/^[a-g](#|b)?\/\d$/)
            expect(vexDuration(n)).toMatch(/^(h|q|8)r?$/)
          }
        }
      }
    }
  })
})
