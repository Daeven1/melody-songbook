import { describe, it, expect } from 'vitest'
import {
  barsForRange, pentatonicPitchClasses, MELODY_RANGE, BORDUN_SOUNDING_RANGE,
} from '../../src/render/xylophoneLayout'

describe('barsForRange', () => {
  const bars = barsForRange(60, 72)   // C4 up to C5

  it('lays out the diatonic bars in order', () => {
    expect(bars.filter(b => !b.isChromatic).map(b => b.name))
      .toEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'])
  })

  it('numbers the diatonic bars consecutively', () => {
    expect(bars.filter(b => !b.isChromatic).map(b => b.position))
      .toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  it('raises F sharp and sits it between F and G', () => {
    const fSharp = bars.find(b => b.name === 'F#4')!
    expect(fSharp.isChromatic).toBe(true)
    expect(fSharp.position).toBe(3.5)
  })

  it('never includes a B flat, which the songbook does not use', () => {
    expect(barsForRange(48, 84).some(b => b.name.includes('b'))).toBe(false)
  })

  it('colours each bar by its pitch', () => {
    expect(bars.find(b => b.name === 'G4')!.colour).toEqual([0, 156, 149])
    expect(bars.find(b => b.name === 'E4')!.colour).toEqual([255, 243, 43])
  })

  it('covers the measured melody and bordun ranges', () => {
    expect(MELODY_RANGE).toEqual([60, 79])
    expect(BORDUN_SOUNDING_RANGE).toEqual([48, 74])
    const melody = barsForRange(...MELODY_RANGE)
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
