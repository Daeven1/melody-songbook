/**
 * The corpus contains no `line` layout breaks, so line breaking is ours to decide.
 * This rule reproduces the printed book exactly: 2-bar songs on one line, 4-bar
 * songs as two lines of two, 8-bar songs as two lines of four.
 */
export function systemBreaksFor(barCount: number): number[] {
  if (barCount <= 2) return []
  return [Math.ceil(barCount / 2)]
}
