import { describe, it, expect } from 'vitest'
import songsJson from '../../src/data/songs.json'
import type { Bar, Song } from '../../src/types'
import type { PhraseEntry } from '../../src/data/phrases'
import { PHRASES } from '../../src/data/phrases'
import { splitIntoSystems } from '../../src/render/systems'
import { phraseBoxSpans, splitPhraseBoxesBySystem } from '../../src/render/phraseBoxes'

const SONGS = songsJson as unknown as Song[]
const byId = (id: string) => SONGS.find(s => s.id === id)!

/** A bar-count-only fixture — phraseBoxes.ts never looks inside `notes`. */
const bars = (count: number): Bar[][] => [Array.from({ length: count }, () => ({ notes: [] }))]

describe('phraseBoxSpans', () => {
  it('gives every box one bar when grouping is absent', () => {
    const entry: PhraseEntry = { letters: ['A', 'B', 'A', 'C'] }
    expect(phraseBoxSpans(entry)).toEqual([
      { letter: 'A', startBar: 0, endBar: 0 },
      { letter: 'B', startBar: 1, endBar: 1 },
      { letter: 'A', startBar: 2, endBar: 2 },
      { letter: 'C', startBar: 3, endBar: 3 },
    ])
  })

  it('respects an explicit grouping', () => {
    const entry: PhraseEntry = { letters: ['A', 'A', 'B'], grouping: [1, 1, 2] }
    expect(phraseBoxSpans(entry)).toEqual([
      { letter: 'A', startBar: 0, endBar: 0 },
      { letter: 'A', startBar: 1, endBar: 1 },
      { letter: 'B', startBar: 2, endBar: 3 },
    ])
  })

  it('matches a known two-bar-per-box song', () => {
    const spans = phraseBoxSpans(PHRASES['au-clair-de-la-lune']!)
    expect(spans).toEqual([
      { letter: 'A', startBar: 0, endBar: 1 },
      { letter: 'A', startBar: 2, endBar: 3 },
    ])
  })

  for (const song of SONGS) {
    it(`${song.id} — spans are contiguous and cover every bar exactly once`, () => {
      const spans = phraseBoxSpans(PHRASES[song.id]!)
      let expectedStart = 0
      for (const span of spans) {
        expect(span.startBar).toBe(expectedStart)
        expect(span.endBar).toBeGreaterThanOrEqual(span.startBar)
        expectedStart = span.endBar + 1
      }
      expect(expectedStart).toBe(song.keys.C.bars.length)
    })
  }
})

describe('splitPhraseBoxesBySystem', () => {
  it('places a single-system song entirely on system 0', () => {
    const spans = phraseBoxSpans(PHRASES['good-night-sleep-tight']!)
    const systems = splitIntoSystems(byId('good-night-sleep-tight').keys.C)
    const result = splitPhraseBoxesBySystem(spans, systems)
    expect(result).toEqual([
      { letter: 'A', systemIndex: 0, startBar: 0, endBar: 0 },
      { letter: 'B', systemIndex: 0, startBar: 1, endBar: 1 },
    ])
  })

  it('maps bar indices onto the correct system for a two-system song', () => {
    const spans = phraseBoxSpans(PHRASES['mo-li-hua']!)
    const systems = splitIntoSystems(byId('mo-li-hua').keys.C)
    const result = splitPhraseBoxesBySystem(spans, systems)
    // 8 bars, split 4+4; boxes are 2 bars each and land cleanly on the boundary.
    expect(result).toEqual([
      { letter: 'A', systemIndex: 0, startBar: 0, endBar: 1 },
      { letter: 'A', systemIndex: 0, startBar: 2, endBar: 3 },
      { letter: 'B', systemIndex: 1, startBar: 0, endBar: 1 },
      { letter: 'C', systemIndex: 1, startBar: 2, endBar: 3 },
    ])
  })

  it('splits a box that straddles a system break into one piece per system', () => {
    // Bars 0-3 on system 0, bars 4-6 on system 1; a box spanning bars 3-4 straddles.
    const systems = bars(4).concat(bars(3))
    const spans = [{ letter: 'A', startBar: 3, endBar: 4 }]
    const result = splitPhraseBoxesBySystem(spans, systems)
    expect(result).toEqual([
      { letter: 'A', systemIndex: 0, startBar: 3, endBar: 3 },
      { letter: 'A', systemIndex: 1, startBar: 0, endBar: 0 },
    ])
  })

  it('never produces a box that crosses out of its system range', () => {
    for (const song of SONGS) {
      const spans = phraseBoxSpans(PHRASES[song.id]!)
      const systems = splitIntoSystems(song.keys.C)
      const result = splitPhraseBoxesBySystem(spans, systems)
      for (const box of result) {
        const systemLength = systems[box.systemIndex]!.length
        expect(box.startBar).toBeGreaterThanOrEqual(0)
        expect(box.endBar).toBeLessThan(systemLength)
        expect(box.startBar).toBeLessThanOrEqual(box.endBar)
      }
    }
  })
})
