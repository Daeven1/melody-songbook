import { describe, it, expect } from 'vitest'
import { rangeForPitches, barsForRange } from '../../src/render/xylophoneLayout'

describe('rangeForPitches', () => {
  it('lays out one octave of the key when the music fits in one', () => {
    // Frog in the Meadow, key of C: E4 and G4.
    expect(rangeForPitches([64, 67], 'C')).toEqual([60, 72])
  })

  it('starts on the key tonic, not always on C', () => {
    // Same song in D: F#4 and A4 — the instrument is set up D to D.
    expect(rangeForPitches([66, 69], 'D')).toEqual([62, 74])
    // In G: B4 and D5.
    expect(rangeForPitches([71, 74], 'G')).toEqual([67, 79])
  })

  it('extends only as far as the music needs, not to another whole octave', () => {
    // Levels bordun in C sounds C3+G3 then C4+G4 — genuinely two octaves.
    expect(rangeForPitches([48, 55, 60, 67], 'C')).toEqual([48, 67])
  })

  it('keeps a one-octave chord bordun to one octave', () => {
    // Chord bordun in C sounds C3+G3 only.
    expect(rangeForPitches([48, 55], 'C')).toEqual([48, 60])
  })

  it('produces eight diatonic bars for a one-octave range', () => {
    const bars = barsForRange(...rangeForPitches([64, 67], 'C'), 'C')
    expect(bars.map(b => b.name)).toEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'])
  })

  it('swaps F for F sharp in the key of D, still one octave', () => {
    const bars = barsForRange(...rangeForPitches([66, 69], 'D'), 'D')
    expect(bars.map(b => b.name)).toEqual(['D4', 'E4', 'F#4', 'G4', 'A4', 'B4', 'C5', 'D5'])
  })
})
