/**
 * Which mallet plays which note.
 *
 * Sticking is decided PER PHRASE with lookahead to what comes next — not per
 * pitch. Lacie's examples settle this: Au Clair de la Lune plays `re` with the
 * right hand in one phrase and the left in another, and Bow Wow Wow does the
 * same with `do`. Any function from pitch to hand is therefore wrong, and two
 * earlier versions of this file were wrong in exactly that way.
 *
 * So her authored sequences are the source of truth (src/data/sticking.ts), and
 * the rules below only fill the gaps where her table stops short. The rules are
 * documented in docs/mallet-sticking-rules.md.
 */
import { AUTHORED_STICKING, TWO_NOTE_SONGS } from '../data/sticking'

export type Hand = 'L' | 'R'

/** A run of consecutive sounding notes, bounded by rests. */
export interface Phrase {
  /** Indices into the sounding-note list. */
  indices: number[]
  pitches: number[]
}

/** Splits a note list into rest-delimited phrases, which is how Lacie groups them. */
export function phrasesOf(pitches: readonly (number | null)[]): Phrase[] {
  const phrases: Phrase[] = []
  let current: Phrase = { indices: [], pitches: [] }
  let soundingIndex = 0
  for (const pitch of pitches) {
    if (pitch === null) {
      if (current.indices.length) phrases.push(current)
      current = { indices: [], pitches: [] }
      continue
    }
    current.indices.push(soundingIndex++)
    current.pitches.push(pitch)
  }
  if (current.indices.length) phrases.push(current)
  return phrases
}

/**
 * Sticking for one phrase, by rule. Used only where Lacie has not authored it.
 * Priority follows docs/mallet-sticking-rules.md.
 */
export function stickingForPhrase(phrase: readonly number[]): Hand[] {
  if (phrase.length === 0) return []
  const distinct = [...new Set(phrase)].sort((a, b) => a - b)

  // Rule 1 — two notes: one hand each, never alternating.
  if (distinct.length === 2) {
    return phrase.map(p => (p === distinct[0] ? 'L' : 'R'))
  }

  // Rule 3 — a single repeated pitch simply alternates.
  if (distinct.length === 1) {
    return phrase.map((_, i) => (i % 2 === 0 ? 'L' : 'R'))
  }

  // Rule 2 — anchor: a low note returned to repeatedly stays in the left hand
  // while the right takes everything above it. Detected as the lowest pitch
  // recurring with higher notes in between.
  const lowest = distinct[0]!
  const lowPositions = phrase.flatMap((p, i) => (p === lowest ? [i] : []))
  const recursNonAdjacently = lowPositions.length >= 2
    && lowPositions.some((pos, i) => i > 0 && pos - lowPositions[i - 1]! > 1)
  if (recursNonAdjacently) {
    return phrase.map(p => (p === lowest ? 'L' : 'R'))
  }

  // Rule 5 — otherwise alternate by group of repeated notes, so a repeated
  // note keeps one hand and the hand changes when the note does.
  const hands: Hand[] = []
  let hand: Hand = phrase[0]! <= (distinct[0]! + distinct[distinct.length - 1]!) / 2 ? 'L' : 'R'
  phrase.forEach((pitch, i) => {
    if (i > 0 && pitch !== phrase[i - 1]) hand = hand === 'L' ? 'R' : 'L'
    hands.push(hand)
  })
  return hands
}

/**
 * The hand for every note of a song, aligned to the note list — null at rests,
 * where no mallet plays.
 */
export function stickingForSong(
  songId: string,
  pitches: readonly (number | null)[],
): (Hand | null)[] {
  const sounding = pitches.filter((p): p is number => p !== null)
  const hands = new Array<Hand | null>(sounding.length).fill(null)

  if (TWO_NOTE_SONGS.has(songId) && sounding.length > 0) {
    // Lacie states these as a rule rather than a sequence: left hand on the
    // left note, right hand on the right note, for the whole song.
    const low = Math.min(...sounding)
    for (let i = 0; i < sounding.length; i++) hands[i] = sounding[i] === low ? 'L' : 'R'
  } else {
    const authored = AUTHORED_STICKING[songId]?.hands
    if (authored && authored.length > 0) {
      // A sequence covering one verse of a repeating song is tiled to fill.
      // Tiling only where it divides evenly; otherwise it is a prefix and the
      // rules below finish the job, rather than drifting out of step.
      const tiles = sounding.length % authored.length === 0
      for (let i = 0; i < sounding.length; i++) {
        if (tiles || i < authored.length) hands[i] = authored[i % authored.length]!
      }
    }
  }

  // Anything still unfilled — a song with no entry, or the tail of a partly
  // specified one — falls back to the rules, phrase by phrase.
  if (hands.some(h => h == null)) {
    for (const phrase of phrasesOf(pitches)) {
      const byRule = stickingForPhrase(phrase.pitches)
      phrase.indices.forEach((soundingIndex, i) => {
        if (hands[soundingIndex] == null) hands[soundingIndex] = byRule[i] ?? 'L'
      })
    }
  }

  // Re-expand to the full note list, leaving rests empty.
  const out: (Hand | null)[] = []
  let s = 0
  for (const pitch of pitches) out.push(pitch === null ? null : hands[s++] ?? null)
  return out
}

/** Where each mallet should be, whether it is striking right now or waiting. */
export interface MalletPositions {
  left: number | null
  right: number | null
}

/**
 * The bar each mallet hovers over.
 *
 * A mallet waits on the note it is about to play rather than parking in a fixed
 * spot, so it travels the instrument the way a player's hand does. The hand
 * sounding now sits on its note; the other looks ahead to its next one, and
 * stays where it finished rather than jumping back to the start.
 */
export function malletPositions(
  pitches: readonly (number | null)[],
  hands: readonly (Hand | null)[],
  currentIndex: number | null,
): MalletPositions {
  const forHand = (hand: Hand): number | null => {
    const from = currentIndex ?? 0
    for (let i = from; i < pitches.length; i++) {
      if (pitches[i] != null && hands[i] === hand) return pitches[i]!
    }
    for (let i = Math.min(from, pitches.length) - 1; i >= 0; i--) {
      if (pitches[i] != null && hands[i] === hand) return pitches[i]!
    }
    return null
  }
  return { left: forHand('L'), right: forHand('R') }
}
