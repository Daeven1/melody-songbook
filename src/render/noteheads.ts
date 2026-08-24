import type { RGB } from '../music/colours'

/**
 * WCAG relative luminance (gamma-corrected). Used to decide whether a notehead's
 * pitch letter should be drawn in black or white so it stays legible on every one
 * of the songbook's nine fills — from a yellow E to a purple A.
 */
export function relativeLuminance([r, g, b]: RGB): number {
  const linear = (channel: number): number => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

/**
 * Picks whichever of black or white gives the higher WCAG contrast ratio against
 * the given fill, rather than a hand-picked table per pitch. The two contrast
 * formulas cross at ~0.179 relative luminance.
 */
export function textColourForFill(rgb: RGB): '#000000' | '#ffffff' {
  const luminance = relativeLuminance(rgb)
  const contrastWithBlack = (luminance + 0.05) / 0.05
  const contrastWithWhite = 1.05 / (luminance + 0.05)
  return contrastWithBlack >= contrastWithWhite ? '#000000' : '#ffffff'
}
