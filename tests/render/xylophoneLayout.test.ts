import { describe, it, expect } from 'vitest'
import {
  barsForRange, pentatonicPitchClasses, MELODY_RANGE, BORDUN_SOUNDING_RANGE,
} from '../../src/render/xylophoneLayout'

describe('barsForRange — a key that does not use F sharp (C)', () => {
  const bars = barsForRange(60, 72, 'C')   // C4 up to C5

  it('lays out one bar per row position, in order', () => {
    expect(bars.map(b => b.name)).toEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'])
  })

  it('numbers every bar consecutively — no half-step raised bar', () => {
    expect(bars.map(b => b.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  it('shows F natural in the F slot, plain letter, no accidental', () => {
    const f = bars.find(b => b.name === 'F4')!
    expect(f.letter).toBe('F')
    expect(f.position).toBe(3)
  })

  it('never shows both F and F sharp at once', () => {
    expect(bars.some(b => b.name.startsWith('F#'))).toBe(false)
  })

  it('colours each bar by its sounding pitch', () => {
    expect(bars.find(b => b.name === 'G4')!.colour).toEqual([0, 156, 149])
    expect(bars.find(b => b.name === 'E4')!.colour).toEqual([255, 243, 43])
  })
})

describe('barsForRange — a key that uses F sharp (D)', () => {
  const bars = barsForRange(60, 72, 'D')

  it('swaps the F slot for F sharp, at the same row position', () => {
    expect(bars.map(b => b.name)).toEqual(['C4', 'D4', 'E4', 'F#4', 'G4', 'A4', 'B4', 'C5'])
    const fSharp = bars.find(b => b.name === 'F#4')!
    expect(fSharp.letter).toBe('F♯')
    expect(fSharp.position).toBe(3)   // same slot F natural would have taken
  })

  it('still numbers every bar consecutively', () => {
    expect(bars.map(b => b.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  it('colours the swapped bar by F sharp, not F natural', () => {
    expect(bars.find(b => b.name === 'F#4')!.colour).toEqual([98, 188, 71])
  })
})

describe('barsForRange — the F key uses F natural, matching the songbook', () => {
  it('shows F natural, not F sharp, when the key is F', () => {
    const bars = barsForRange(60, 72, 'F')
    expect(bars.some(b => b.name.startsWith('F#'))).toBe(false)
    expect(bars.some(b => b.name === 'F4')).toBe(true)
  })
})

describe('barsForRange — general', () => {
  it('never includes a B flat, which the songbook does not use', () => {
    for (const key of ['C', 'D', 'F', 'G'] as const) {
      expect(barsForRange(48, 84, key).some(b => b.name.includes('b'))).toBe(false)
    }
  })

  it('covers the measured melody and bordun ranges', () => {
    expect(MELODY_RANGE).toEqual([60, 79])
    expect(BORDUN_SOUNDING_RANGE).toEqual([48, 74])
    const melody = barsForRange(...MELODY_RANGE, 'C')
    expect(melody[0]!.name).toBe('C4')
    expect(melody.at(-1)!.name).toBe('G5')
  })
})

describe('pentatonicPitchClasses', () => {
  it('gives the five bars set out for each key', () => {
    expect(pentatonicPitchClasses('C')).toEqual([0, 2, 4, 7, 9])    // C D E G A
    expect(pentatonicPitchClasses('D')).toEqual([2, 4, 6, 9, 11])   // D E F# A B
    expect(pentatonicPitchClasses('F')).toEqual([0, 2, 5, 7, 9])    // F G A C D
    expect(pentatonicPitchClasses('G')).toEqual([2, 4, 7, 9, 11])   // G A B D E
  })
})
