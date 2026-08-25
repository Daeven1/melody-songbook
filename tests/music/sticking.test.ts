import { describe, it, expect } from 'vitest'
import { handForPitch } from '../../src/music/sticking'

describe('handForPitch', () => {
  // Frog in the Meadow in C: sol-mi, E4 = 64 and G4 = 67.
  const solMi = [64, 67]

  it('gives each of two pitches its own mallet', () => {
    expect(handForPitch(64, solMi)).toBe('L')
    expect(handForPitch(67, solMi)).toBe('R')
  })

  it('always returns the same hand for the same pitch — the actual bug', () => {
    // A repeated note must not alternate mallets.
    const repeated = [67, 67, 67, 64, 64]
    const hands = repeated.map(p => handForPitch(p, repeated))
    expect(hands).toEqual(['R', 'R', 'R', 'L', 'L'])
  })

  it('splits a five-note pentatonic by the instrument layout', () => {
    // C D E G A — low bars left, high bars right.
    const pentatonic = [60, 62, 64, 67, 69]
    expect(pentatonic.map(p => handForPitch(p, pentatonic))).toEqual(['L', 'L', 'L', 'R', 'R'])
  })

  it('sends each note to the nearer mallet when there are more than two', () => {
    // Three notes: the outer two are clearly one per hand, and the middle note
    // goes to whichever mallet is nearer rather than forcing an alternation.
    const three = [60, 64, 72]           // C4, E4, C5 — midpoint 66
    expect(handForPitch(60, three)).toBe('L')
    expect(handForPitch(64, three)).toBe('L')   // nearer the low end
    expect(handForPitch(72, three)).toBe('R')
  })

  it('handles a single-pitch song without dividing by zero', () => {
    expect(handForPitch(67, [67, 67])).toBe('L')
  })

  it('ignores rests, which arrive as a filtered-out pitch list', () => {
    expect(handForPitch(67, [64, 67])).toBe('R')
  })
})
