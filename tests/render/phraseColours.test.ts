import { describe, it, expect } from 'vitest'
import { colourForLetter, hexToRgba } from '../../src/render/phraseColours'

describe('colourForLetter', () => {
  it('maps the four songbook letters to their fixed colours', () => {
    expect(colourForLetter('A')).toBe('#FF0000')
    expect(colourForLetter('B')).toBe('#00B050')
    expect(colourForLetter('C')).toBe('#7030A0')
    expect(colourForLetter('D')).toBe('#0432FF')
  })

  it('throws for a letter the songbook never uses', () => {
    expect(() => colourForLetter('E')).toThrow(/E/)
  })
})

describe('hexToRgba', () => {
  it('expands a hex colour at the given alpha', () => {
    expect(hexToRgba('#FF0000', 0.12)).toBe('rgba(255, 0, 0, 0.12)')
    expect(hexToRgba('#0432ff', 1)).toBe('rgba(4, 50, 255, 1)')
  })

  it('throws for anything that is not #rrggbb', () => {
    expect(() => hexToRgba('red', 0.5)).toThrow()
    expect(() => hexToRgba('#fff', 0.5)).toThrow()
  })
})
