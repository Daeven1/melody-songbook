import type { Hand } from '../music/sticking'

/**
 * Mallet sticking, authored by Lacie.
 *
 * One hand per SOUNDING note, in order; rests carry no hand because the mallet
 * is not playing. Sticking is relative, so a single sequence serves all four
 * keys. A sequence covering one verse of a repeating song is tiled to fill —
 * verified by test to divide the song's note count exactly.
 *
 * See docs/mallet-sticking-rules.md. The short version: this is DATA rather
 * than an algorithm because sticking is chosen per phrase with lookahead, and
 * Lacie's own examples give the same note different hands in different
 * phrases. No pitch-to-hand function can be right.
 *
 * Her guiding principle, in her words: alternating mallets "adds a lot to
 * remember", so its complexity is spent only where it earns the best outcome.
 * How a phrase ends is sometimes set up for the next one; a rest is time to
 * move both mallets somewhere new.
 */

/** Songs Lacie specifies by rule rather than by sequence: one hand per note. */
export const TWO_NOTE_SONGS = new Set([
  'good-night-sleep-tight',
  'goodnight-sleep-tight',
  'frog-in-the-meadow',
  'rain-rain-go-away',
  'starlight-starbright',
])

const parse = (s: string): Hand[] => [...s.replace(/[^LR]/g, '')] as Hand[]

export interface AuthoredSticking {
  hands: Hand[]
  /** False where a hand had to be inferred; see the note on that entry. */
  complete: boolean
}

export const AUTHORED_STICKING: Record<string, AuthoredSticking> = {
  // mi-re-do | mi-re-do | do-do-do-do | re-re-re-re | mi-re-do
  'hot-cross-buns': { hands: parse('RLR RLR RLRL RLRL RLR'), complete: true },

  // Two verses of 13 and 12.
  'mary-had-a-little-lamb': { hands: parse('RLRLRRRLLLRRR RLRLRRRLLRLR'), complete: true },

  // mi-mi-mi-mi | re-re-re-re | do-do-do | re-re-re | mi-re-do
  'peas-porridge-hot': { hands: parse('RLRL RLRL LLL RRR RLR'), complete: true },

  // One verse of 13, sung twice; the second ends on a crossover.
  'closet-key': { hands: parse('LLRRLLRLLRRLR'), complete: true },

  // do-do-do | re-mi-re | do-mi-re-re-do — one verse, sung twice.
  // Now ends on a crossover, where an earlier version ended in the left hand.
  'au-clair-de-la-lune': { hands: parse('LLL RRR LRLLR'), complete: true },

  // do-do-do | mi-mi-mi-mi | so-so-so-la-so-mi-do | mi-re-do
  'bow-wow-wow': { hands: parse('LLL RLRL RRRRRLL RLR'), complete: true },

  // do-mi-do-mi-do-mi-so | so-so-so-la-so-mi-do-re | mi-re-do
  // NOTE: Lacie's second phrase lists seven hands for its eight notes. The
  // final `re` is inferred as left, following the left hand already on `do`
  // and matching the ending of her previous draft of this line.
  'pumpkin-pumpkin': { hands: parse('LRLRLRL RRRRRLLL RLR'), complete: false },

  // mi-so-so-la-mi-so-so | mi-so-so-la | mi-re-do — one verse, sung twice.
  // NOTE: Lacie's second phrase lists eight hands against its four notes, so
  // it cannot be read directly; her previous draft of that line (left-right-
  // right-right) is kept, which makes the verse add up. Worth confirming.
  'im-an-acorn': { hands: parse('LRRRLRR LRRR RLR'), complete: false },

  // so-so-mi so-so-mi so-la-so — the same nine hands for all four phrases.
  'teddy-bear': { hands: parse('RRL RRL RLR'), complete: true },

  // so-so-mi-la-so-mi ×2 | so-mi-so-mi | so-so-do
  'ring-around-the-rosie': { hands: parse('RRLRRL RRLRRL RLRL RRL'), complete: true },

  // mi-so-so-la-mi-so-so | mi-so-so-la-mi-re | mi-so-so-la-mi-so-so | mi-so-mi-re-do
  'great-big-house-in-new-orleans': { hands: parse('LRRRLRR LRRRLR LRRRLRR LRRLR'), complete: true },

  // DO-DO-DO-so-la-la-so | MI-MI-RE-RE-DO — one verse, sung twice.
  'ece-has-a-music-room': { hands: parse('RRRLRRL RRLLR'), complete: true },

  // so-la-do-mi-mi-re-do | so-la-do-do-do-la-so | so-la-do-mi-mi-re-do | mi-mi-re-re-do
  'shake-them-simmons-down': { hands: parse('LLLRRLR LLLRRLL LLLRRLR RRLLR'), complete: true },

  // so-mi-so-mi-la-so | do-so-so-la-so | so-mi-so-mi-la-so | mi-mi-re-re-do
  'cut-the-cake': { hands: parse('RLRLRR RLLRL RLRLRR RRLLR'), complete: true },

  // mi-mi-so-la-do-do-la-so-so-la-so ×2 | so-so-so-mi-so-la-la-so | mi-re-mi-so-mi-re-do-do-re-do
  'mo-li-hua': { hands: parse('LLLLRRLLLRL LLLLRRLLLRL RRRLRRRR RLRRRLRLRL'), complete: true },
}
