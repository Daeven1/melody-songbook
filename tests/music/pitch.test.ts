import { describe, it, expect } from 'vitest'
import {
  pitchClass, octaveOf, noteLetter, alterationOf, accidentalSymbol, spelledName,
} from '../../src/music/pitch'

describe('pitchClass', () => {
  it('reduces MIDI numbers to 0-11', () => {
    expect(pitchClass(60)).toBe(0)   // C4
    expect(pitchClass(67)).toBe(7)   // G4
    expect(pitchClass(64)).toBe(4)   // E4
  })
})

describe('octaveOf', () => {
  it('uses scientific pitch notation where MIDI 60 is C4', () => {
    expect(octaveOf(60)).toBe(4)
    expect(octaveOf(72)).toBe(5)
  })
})

describe('tpc spelling', () => {
  it('reads a natural G from the corpus (tpc 15)', () => {
    expect(noteLetter(15)).toBe('G')
    expect(alterationOf(15)).toBe(0)
    expect(accidentalSymbol(15)).toBe('')
    expect(spelledName(15)).toBe('G')
  })

  it('reads a B-flat from the corpus (tpc 12)', () => {
    expect(noteLetter(12)).toBe('B')
    expect(alterationOf(12)).toBe(-1)
    expect(accidentalSymbol(12)).toBe('b')
    expect(spelledName(12)).toBe('Bb')
  })

  it('reads an F-sharp as a sharpened F, never a flattened G (tpc 20)', () => {
    expect(noteLetter(20)).toBe('F')
    expect(alterationOf(20)).toBe(1)
    expect(accidentalSymbol(20)).toBe('#')
    expect(spelledName(20)).toBe('F#')
  })

  it('covers every natural letter', () => {
    const naturals = [13, 14, 15, 16, 17, 18, 19].map(noteLetter)
    expect(naturals).toEqual(['F', 'C', 'G', 'D', 'A', 'E', 'B'])
  })
})
