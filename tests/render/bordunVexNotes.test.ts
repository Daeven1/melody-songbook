import { describe, it, expect } from 'vitest'
import { bordunVexKey, bordunVexDuration } from '../../src/render/bordunVexNotes'

describe('bordunVexKey', () => {
  it('maps every pitch class the corpus actually uses', () => {
    expect(bordunVexKey(72)).toBe('c/5')  // C
    expect(bordunVexKey(74)).toBe('d/5')  // D
    expect(bordunVexKey(77)).toBe('f/5')  // F
    expect(bordunVexKey(79)).toBe('g/5')  // G
    expect(bordunVexKey(81)).toBe('a/5')  // A
  })

  it('resolves the octave independently of the pitch class', () => {
    expect(bordunVexKey(84)).toBe('c/6')
    expect(bordunVexKey(60)).toBe('c/4')
  })

  it('throws for a pitch class outside the tonic/fifth vocabulary', () => {
    expect(() => bordunVexKey(73)).toThrow(/outside the songbook/)  // C#
  })
})

describe('bordunVexDuration', () => {
  it('maps half and quarter — the only durations the borduns use', () => {
    expect(bordunVexDuration('half', false)).toBe('h')
    expect(bordunVexDuration('quarter', false)).toBe('q')
  })

  it('marks a rest', () => {
    expect(bordunVexDuration('quarter', true)).toBe('qr')
  })
})
