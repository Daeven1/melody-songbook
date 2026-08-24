import type { BordunId } from '../types'

/**
 * PROVISIONAL — confirm with Lacie before the app ships.
 *
 * Hand assignment per event in the one-bar pattern. The five borduns are hand-technique
 * lessons, so the bottom xylophone shows left and right correctly rather than just pitches.
 *   chord / levels  — both hands strike together
 *   broken          — hands alternate
 *   crossover       — the right hand crosses over the left to reach the upper tonic
 */
export const BORDUN_HANDS: Record<BordunId, ('L' | 'R' | 'both')[]> = {
  chord: ['both', 'both'],
  levels: ['both', 'both'],
  broken: ['L', 'R', 'L', 'R'],
  crossover: ['L', 'R', 'R', 'R'],
  'crossover-challenge': ['L', 'R', 'R', 'R'],
}
