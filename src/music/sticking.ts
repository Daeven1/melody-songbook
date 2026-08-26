/**
 * Which mallet plays which note.
 *
 * The rule is per-PITCH, not per-position: a given bar always belongs to the
 * same hand for the whole song. Choosing by note index instead (alternating
 * L, R, L, R down the melody) looks right on a two-note song only by accident
 * — the moment a pitch repeats, the two mallets alternate on one bar, which is
 * not how anyone plays a xylophone.
 *
 * The split follows the instrument's physical layout: bars run low on the left
 * to high on the right, so the left mallet covers the lower half of the song's
 * range and the right mallet the upper half. With only two notes that gives one
 * mallet per bar; with more, each note simply goes to whichever mallet is
 * nearer — the same rule, since each mallet rests over its own half.
 */
export type Hand = 'L' | 'R'

/**
 * Splits at the midpoint of the song's pitch RANGE rather than at the median
 * note. For sol-mi (E and G) that puts one pitch in each hand, which is the
 * case this rule exists for.
 */
export function handForPitch(pitch: number, songPitches: readonly number[]): Hand {
  const sounding = songPitches.filter(p => Number.isFinite(p))
  if (sounding.length === 0) return 'L'
  const low = Math.min(...sounding)
  const high = Math.max(...sounding)
  if (low === high) return 'L'
  return pitch < (low + high) / 2 ? 'L' : 'R'
}

/** Where each mallet should be, whether it is striking right now or waiting. */
export interface MalletPositions {
  left: number | null
  right: number | null
}

/**
 * The bar each mallet hovers over.
 *
 * A mallet waits on the note it is about to play rather than parking in a
 * fixed spot, so it travels the instrument the way a player's hand does. The
 * hand that is currently sounding sits on its note; the other looks ahead to
 * the next note assigned to it, falling back to its last one at the end of the
 * piece so it does not jump back to the start.
 */
export function malletPositions(
  pitches: readonly (number | null)[],
  currentIndex: number | null,
  songPitches: readonly number[],
): MalletPositions {
  const forHand = (hand: Hand): number | null => {
    const from = currentIndex ?? 0
    for (let i = from; i < pitches.length; i++) {
      const pitch = pitches[i]
      if (pitch != null && handForPitch(pitch, songPitches) === hand) return pitch
    }
    // Past the last note this hand plays — stay where it finished.
    for (let i = Math.min(from, pitches.length) - 1; i >= 0; i--) {
      const pitch = pitches[i]
      if (pitch != null && handForPitch(pitch, songPitches) === hand) return pitch
    }
    return null
  }
  return { left: forHand('L'), right: forHand('R') }
}
