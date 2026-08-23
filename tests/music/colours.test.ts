import { describe, it, expect } from 'vitest'
import { PITCH_COLOURS, colourForPitch, rgbToCss } from '../../src/music/colours'

describe('colour table', () => {
  it('matches the values harvested from the MuseScore corpus', () => {
    expect(PITCH_COLOURS[0]).toEqual([226, 28, 72])    // C
    expect(PITCH_COLOURS[2]).toEqual([249, 157, 28])   // D
    expect(PITCH_COLOURS[4]).toEqual([255, 243, 43])   // E
    expect(PITCH_COLOURS[5]).toEqual([188, 216, 95])   // F
    expect(PITCH_COLOURS[6]).toEqual([98, 188, 71])    // F#
    expect(PITCH_COLOURS[7]).toEqual([0, 156, 149])    // G
    expect(PITCH_COLOURS[9]).toEqual([94, 80, 161])    // A
    expect(PITCH_COLOURS[10]).toEqual([141, 91, 166])  // Bb
    expect(PITCH_COLOURS[11]).toEqual([207, 62, 150])  // B
  })

  it('covers exactly the nine pitch classes the corpus uses', () => {
    expect(Object.keys(PITCH_COLOURS).map(Number).sort((a, b) => a - b))
      .toEqual([0, 2, 4, 5, 6, 7, 9, 10, 11])
  })

  it('resolves a colour from any octave of the same pitch class', () => {
    expect(colourForPitch(67)).toEqual([0, 156, 149])  // G4
    expect(colourForPitch(79)).toEqual([0, 156, 149])  // G5
  })

  it('throws for a pitch class the songbook never uses', () => {
    expect(() => colourForPitch(61)).toThrow(/C#/)     // pitch class 1
  })

  it('formats CSS', () => {
    expect(rgbToCss([0, 156, 149])).toBe('rgb(0, 156, 149)')
  })
})
