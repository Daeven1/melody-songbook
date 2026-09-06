/**
 * The bar bench: pure geometry and state for a physical alto xylophone.
 *
 * Everything here is arithmetic on centimetres and plain data, so it can be
 * unit-tested; the three.js scene in scene.ts only turns these numbers into
 * meshes. Dimensions follow the Sonor Global Beat alto: a deep resonator box,
 * wider at the low end and tapering toward the high end, with every bar centred
 * across it so each overhangs both walls equally.
 */
import type { KeyName } from '../types'
import type { RGB } from '../music/colours'
import { barsForRange, type XylophoneBar } from '../render/xylophoneLayout'

/** C4 up to A5 — the thirteen bars of the classroom alto. */
export const BENCH_RANGE = [60, 81] as const

export const BOX = {
  pitch: 3.7,          // bar centre to bar centre
  barWidth: 3.0,
  barThickness: 2.0,
  lengthLow: 30,       // the lowest bar
  lengthHigh: 20,      // the highest bar
  holeRadius: 0.55,
  wall: 1.5,
  height: 17,
  widthLow: 20,        // outer width at the low end
  widthHigh: 10.5,     // outer width at the high end — about half, so the small end plate spans it
  notchHeight: 2.2,    // the cove cut into the long walls just inboard of each foot
  notchLength: 6,
  plateLength: 7,
  plateThickness: 1.4,
  plateIn: 2.0,        // how far each plate laps onto the box top
  cordY: 0.55,         // cord centre above the wall top
  /** Half the box length: thirteen bars plus a little past the outermost ones. */
  halfLength: (13 * 3.7 + 4) / 2,
} as const

export const BAR_Y = BOX.cordY + 0.6                              // underside of a seated bar
export const PEG_TOP = BAR_Y + BOX.barThickness - 0.25             // pegs stop just under the bar tops
export const FLOOR_Y = -BOX.height
export const FLOOR_TOP = FLOOR_Y + BOX.notchHeight + BOX.wall      // top face of the box floor
export const HALF_LENGTH_OUT = BOX.halfLength - BOX.plateIn + BOX.plateLength   // box body under the plates
export const TAPER = Math.atan((BOX.widthLow - BOX.widthHigh) / 2 / (2 * BOX.halfLength))

export type BarState = 'seated' | 'lifted' | 'tilted' | 'rested' | 'aside'

export interface BenchBar extends XylophoneBar {
  index: number
  /** Bar length in centimetres: longer bar, lower note. */
  length: number
  /** Centre of the bar along the box. */
  x: number
  colour: RGB
}

export function barLength(index: number, count: number): number {
  return BOX.lengthLow + (BOX.lengthHigh - BOX.lengthLow) * (index / (count - 1))
}

export function barX(index: number, count: number): number {
  return (index - count / 2 + 0.5) * BOX.pitch
}

/** The thirteen bars for a key, with the F slots swapped to F♯ where the key needs it. */
export function benchBars(key: KeyName): BenchBar[] {
  const bars = barsForRange(BENCH_RANGE[0], BENCH_RANGE[1], key)
  return bars.map((bar, index) => ({
    ...bar, index, length: barLength(index, bars.length), x: barX(index, bars.length),
  }))
}

/** Outer width of the box at a point along its length. */
export function boxWidthAt(x: number): number {
  return BOX.widthLow + (BOX.widthHigh - BOX.widthLow) * ((x + BOX.halfLength) / (2 * BOX.halfLength))
}

/** The cords run along the middle of each wall top. */
export function cordZAt(x: number): number {
  return boxWidthAt(x) / 2 - BOX.wall / 2
}

/** The inner face of a wall. */
export function innerHalfAt(x: number): number {
  return boxWidthAt(x) / 2 - BOX.wall
}

/**
 * Local z of the peg hole along a bar, measured from the bar's near end
 * (the bar runs from local -length at the far end to 0 at the near end). Seated,
 * the bar is centred across the box, so the hole lands over the far cord.
 */
export function holeOffset(length: number, x: number): number {
  return -length / 2 - cordZAt(x)
}

/**
 * Resting pose inside the box at a point along its length: the bottom near
 * corner on the floor, the top near corner touching the near wall, the underside
 * leaning on the far wall's top inner edge. The corner offset and the angle
 * depend on each other, so iterate.
 */
export function restPose(x: number): { ang: number; z: number } {
  const near = innerHalfAt(x), far = innerHalfAt(x)
  let ang = Math.atan2(-FLOOR_TOP, near + far)
  let z = near
  for (let k = 0; k < 6; k++) {
    z = near - BOX.barThickness * Math.sin(ang) - 0.05
    ang = Math.atan2(-FLOOR_TOP, z + far)
  }
  return { ang, z }
}

// ---- selection ----

export function selectOnly(_current: ReadonlySet<number>, index: number): Set<number> {
  return new Set([index])
}

export function toggleSelection(current: ReadonlySet<number>, index: number): Set<number> {
  const next = new Set(current)
  if (next.has(index)) next.delete(index)
  else next.add(index)
  return next
}

export function summarizeSelection(
  selected: ReadonlySet<number>,
  states: readonly BarState[],
): { ids: number[]; commonState: BarState | null } {
  const ids = [...selected].sort((a, b) => a - b)
  const distinct = new Set(ids.map(i => states[i]))
  const commonState = distinct.size === 1 ? [...distinct][0]! : null
  return { ids, commonState }
}
