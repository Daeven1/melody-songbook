import type { Hand } from '../music/sticking'

/**
 * Mallet sticking, authored by Lacie.
 *
 * One hand per SOUNDING note, in order; rests carry no hand because the mallet
 * is not playing. Sticking is relative, so a single sequence serves all four
 * keys. Where a sequence covers one verse of a song that repeats it, it is
 * tiled to fill — verified by test to divide the song's note count exactly.
 *
 * See docs/mallet-sticking-rules.md for the reasoning. The short version: this
 * is DATA rather than an algorithm because sticking is chosen per phrase with
 * lookahead to what comes next, and Lacie's own examples give the same note
 * different hands in different phrases. No pitch-to-hand function can be right.
 */

/** Songs Lacie specifies by rule rather than by sequence: one hand per note. */
export const TWO_NOTE_SONGS = new Set([
  'goodnight-sleep-tight',
  'good-night-sleep-tight',
  'frog-in-the-meadow',
  'rain-rain-go-away',
  'starlight-starbright',
])

/**
 * Closet Key is a two-note song plus a passing `re`, which Lacie says takes the
 * left hand. Handled as a rule, keyed by scale degree above the tonic.
 */
export const CLOSET_KEY_LEFT_DEGREES = new Set([0, 2]) // do and re left, mi right

const parse = (s: string): Hand[] =>
  [...s.replace(/[^LR]/g, '')] as Hand[]

export interface AuthoredSticking {
  hands: Hand[]
  /** False where Lacie's table stops short and the rest is filled by rule. */
  complete: boolean
}

export const AUTHORED_STICKING: Record<string, AuthoredSticking> = {
  // do-do-do | mi-mi-mi-mi | so-so-so-la-so-mi-do  mi-re-do
  'bow-wow-wow': { hands: parse('LLL RLRL RRRRRLL RLR'), complete: true },

  // mi-so-so-la-mi-so-so | mi-so-so-la-mi-re | mi-so-so-la-mi-so-so | mi-so-mi-re-do
  'great-big-house-in-new-orleans': { hands: parse('LRRRLRR LRRRLR LRRRLRR LRLRL'), complete: true },

  // do-mi-do-mi-do-mi-so | so-so-so-la-so-mi-do-re  mi-re-do
  'pumpkin-pumpkin': { hands: parse('LRLRLRL RLRLRLLL RLR'), complete: true },

  // so-so-mi so-so-mi so-la-so — the same nine hands for all four phrases
  'teddy-bear': { hands: parse('RRL RRL RLR'), complete: true },

  // so-so-mi-la-so-mi ×2 | so-mi-so-mi | so-so-do
  'ring-around-the-rosie': { hands: parse('RRLRRL RRLRRL RLRL RRL'), complete: true },

  // DO-DO-DO-so-la-la-so | MI-MI-RE-RE-DO  (one verse, sung twice)
  'ece-has-a-music-room': { hands: parse('RRRLRRL RRLLR'), complete: true },

  // so-la-do-mi-mi-re-do | so-la-do-do-do-la-so | so-la-do-mi-mi-re-do | mi-mi-re-re-do
  'shake-them-simmons-down': { hands: parse('LLLRRLR LLLRLRL LLLRRLR RRLLR'), complete: true },

  // so-mi-so-mi-la-so | do-so-so-la-so | so-mi-so-mi-la-so | mi-mi-re-re-do
  'cut-the-cake': { hands: parse('RLRLRR RLLRL RLRLRR RRLLR'), complete: true },

  // mi-mi-so-la-do-do-la-so-so-la-so ×2 | so-so-so-mi-so-la-la-so | mi-re-mi-so-mi-re-do-do-re-do
  'mo-li-hua': { hands: parse('LLLLRRLLLRL LLLLRRLLLRL RRRLRRRL RLRRRLRLRL'), complete: true },

  // do-do-do | re-mi-re | do-mi-re-re-do  (one verse, sung twice)
  'au-clair-de-la-lune': { hands: parse('LLL RRR LRLLL'), complete: true },

  // One verse. Lacie's closing `mi-re-do` matches the SECOND verse's ending;
  // the first verse ends `mi-re-re`, which takes the same hands.
  'im-an-acorn': { hands: parse('LRRRLRR LRRR RLR'), complete: true },

  // --- Partly specified: Lacie's table stops before the end of these. ---

  // mi-re-do-re | mi-mi-mi | re-re-re | mi-mi-mi  — first 13 of 25.
  'mary-had-a-little-lamb': { hands: parse('RLRL RLR LRL RLR'), complete: false },

  // mi-re-do ×2 — the 11-note third phrase is not specified.
  'hot-cross-buns': { hands: parse('RLR RLR'), complete: false },

  // mi-mi-mi-mi only. Lacie's entry lists three hands for this four-note
  // figure, read here as the alternation continuing.
  'peas-porridge-hot': { hands: parse('LRLR'), complete: false },
}
