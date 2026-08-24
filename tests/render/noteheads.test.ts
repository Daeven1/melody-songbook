import { describe, it, expect } from 'vitest'
import { PITCH_COLOURS } from '../../src/music/colours'
import { relativeLuminance, textColourForFill } from '../../src/render/noteheads'

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance([0, 0, 0])).toBeCloseTo(0)
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1)
  })

  it('ranks a bright fill above a dark one', () => {
    expect(relativeLuminance(PITCH_COLOURS[4]!)).toBeGreaterThan(relativeLuminance(PITCH_COLOURS[9]!)) // E > A
  })
})

describe('textColourForFill', () => {
  it('picks dark text for the yellow E fill', () => {
    expect(textColourForFill(PITCH_COLOURS[4]!)).toBe('#000000')
  })

  it('picks light text for the purple A fill', () => {
    expect(textColourForFill(PITCH_COLOURS[9]!)).toBe('#ffffff')
  })

  it('picks light text for the crimson C fill', () => {
    expect(textColourForFill(PITCH_COLOURS[0]!)).toBe('#ffffff')
  })

  it('picks black on white and white on black', () => {
    expect(textColourForFill([255, 255, 255])).toBe('#000000')
    expect(textColourForFill([0, 0, 0])).toBe('#ffffff')
  })

  it('resolves every pitch colour in the songbook table without throwing', () => {
    for (const rgb of Object.values(PITCH_COLOURS)) {
      expect(['#000000', '#ffffff']).toContain(textColourForFill(rgb))
    }
  })
})
