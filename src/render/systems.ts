import type { Bar, KeyVersion } from '../types'

/**
 * Groups bars into staff lines. `systemBreaks` holds the bar indices at which a
 * new line starts, computed at import time to reproduce the printed book:
 * 2-bar songs stay on one line, longer songs split in half.
 */
export function splitIntoSystems(version: KeyVersion): Bar[][] {
  const boundaries = [0, ...version.systemBreaks, version.bars.length]
  const systems: Bar[][] = []
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i]!
    const end = boundaries[i + 1]!
    if (end > start) systems.push(version.bars.slice(start, end))
  }
  return systems
}
