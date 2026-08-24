import type { Bar } from '../types'
import type { PhraseEntry } from '../data/phrases'

/** A phrase box's span in the full (unsplit) bar sequence for one key version. */
export interface PhraseBoxSpan {
  letter: string
  /** Bar index, 0-based, inclusive. */
  startBar: number
  /** Bar index, 0-based, inclusive. */
  endBar: number
}

/** Which bars each phrase box covers, derived from `letters` and `grouping`. */
export function phraseBoxSpans(entry: PhraseEntry): PhraseBoxSpan[] {
  const grouping = entry.grouping ?? entry.letters.map(() => 1)
  let bar = 0
  return entry.letters.map((letter, i) => {
    const barsInBox = grouping[i]
    if (barsInBox === undefined) {
      throw new Error(`grouping has no entry for box ${i} ('${letter}')`)
    }
    const startBar = bar
    bar += barsInBox
    return { letter, startBar, endBar: bar - 1 }
  })
}

/** One phrase box's placement within a single system, in bar indices local to it. */
export interface PhraseBoxOnSystem {
  letter: string
  systemIndex: number
  /** Bar index local to the system, 0-based, inclusive. */
  startBar: number
  /** Bar index local to the system, 0-based, inclusive. */
  endBar: number
}

/**
 * Clips each phrase box to the system(s) it falls on. A box that would straddle a
 * system break — never observed in the current 19-song corpus, but not structurally
 * ruled out — is split into one piece per system instead of drawn crossing the gap.
 */
export function splitPhraseBoxesBySystem(spans: PhraseBoxSpan[], systems: Bar[][]): PhraseBoxOnSystem[] {
  const systemRanges: { start: number; end: number }[] = []
  let cursor = 0
  for (const system of systems) {
    systemRanges.push({ start: cursor, end: cursor + system.length - 1 })
    cursor += system.length
  }

  const result: PhraseBoxOnSystem[] = []
  for (const span of spans) {
    systemRanges.forEach((range, systemIndex) => {
      const start = Math.max(span.startBar, range.start)
      const end = Math.min(span.endBar, range.end)
      if (start > end) return
      result.push({
        letter: span.letter,
        systemIndex,
        startBar: start - range.start,
        endBar: end - range.start,
      })
    })
  }
  return result
}
