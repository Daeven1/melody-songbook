import { describe, it, expect } from 'vitest'
import {
  BENCH_RANGE, BOX, benchBars, barLength, barX, boxWidthAt, cordZAt, innerHalfAt,
  restPose, holeOffset, selectOnly, toggleSelection, summarizeSelection,
} from '../../src/bench/model'

describe('benchBars — the physical alto instrument, C4 up to A5', () => {
  it('lays out thirteen bars in order, low C on the left', () => {
    const bars = benchBars('C')
    expect(bars.map(b => b.name)).toEqual([
      'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5', 'A5',
    ])
    expect(BENCH_RANGE).toEqual([60, 81])
  })

  it('swaps both F slots for F sharp in a key that needs it', () => {
    const bars = benchBars('D')
    expect(bars[3]!.letter).toBe('F♯')
    expect(bars[10]!.letter).toBe('F♯')
    expect(bars[3]!.midi).toBe(66)
  })

  it('gives every bar its songbook colour and a length that shrinks with pitch', () => {
    const bars = benchBars('C')
    expect(bars[0]!.colour).toEqual([226, 28, 72])       // C is red
    for (let i = 1; i < bars.length; i++) expect(bars[i]!.length).toBeLessThan(bars[i - 1]!.length)
  })
})

describe('bar geometry', () => {
  const n = 13

  it('runs from 30 cm for the lowest bar to 20 cm for the highest', () => {
    expect(barLength(0, n)).toBe(30)
    expect(barLength(n - 1, n)).toBe(20)
  })

  it('centres the row of bars on the box and spaces them one pitch apart', () => {
    const xs = Array.from({ length: n }, (_, i) => barX(i, n))
    expect(xs.reduce((a, b) => a + b, 0)).toBeCloseTo(0)
    expect(xs[1]! - xs[0]!).toBeCloseTo(BOX.pitch)
  })
})

describe('the tapered box', () => {
  it('is widest at the low end and narrowest at the high end', () => {
    expect(boxWidthAt(-BOX.halfLength)).toBe(BOX.widthLow)
    expect(boxWidthAt(BOX.halfLength)).toBe(BOX.widthHigh)
    expect(boxWidthAt(0)).toBeCloseTo((BOX.widthLow + BOX.widthHigh) / 2)
  })

  it('runs the cords along the middle of each wall top', () => {
    expect(cordZAt(0)).toBeCloseTo(boxWidthAt(0) / 2 - BOX.wall / 2)
    expect(innerHalfAt(0)).toBeCloseTo(boxWidthAt(0) / 2 - BOX.wall)
  })
})

describe('holeOffset — where the peg hole sits along a bar', () => {
  it('lands over the far cord once the bar is centred across the box', () => {
    const n = 13
    for (let i = 0; i < n; i++) {
      const x = barX(i, n), L = barLength(i, n)
      // seated, the bar's near end sits at z = L/2, so world z of the hole is L/2 + offset
      expect(L / 2 + holeOffset(L, x)).toBeCloseTo(-cordZAt(x))
    }
  })
})

describe('restPose — a bar leaning inside the box', () => {
  it('puts the near corner on the floor inside the near wall, leaning up toward the far wall', () => {
    for (const x of [-BOX.halfLength + 4, 0, BOX.halfLength - 4]) {
      const { ang, z } = restPose(x)
      expect(ang).toBeGreaterThan(0)
      expect(ang).toBeLessThan(Math.PI / 2)
      expect(z).toBeLessThan(innerHalfAt(x))
      expect(z).toBeGreaterThan(0)
    }
  })

  it('is short enough that even the shortest bar hangs over the far wall', () => {
    const x = barX(12, 13)
    const { ang, z } = restPose(x)
    const reach = (z + innerHalfAt(x)) / Math.cos(ang)   // along the bar to the far wall's top edge
    expect(reach).toBeLessThan(barLength(12, 13))
  })
})

describe('selection', () => {
  it('selectOnly replaces the whole selection with one bar', () => {
    expect([...selectOnly(new Set([1, 2]), 5)]).toEqual([5])
  })

  it('toggleSelection adds an absent bar and removes a present one, without mutating', () => {
    const start = new Set([1])
    const added = toggleSelection(start, 2)
    expect([...added].sort()).toEqual([1, 2])
    expect([...toggleSelection(added, 1)]).toEqual([2])
    expect([...start]).toEqual([1])
  })

  it('summarizes nothing, one bar, or several with a shared state', () => {
    const states = ['seated', 'seated', 'rested'] as const
    expect(summarizeSelection(new Set(), states)).toEqual({ ids: [], commonState: null })
    expect(summarizeSelection(new Set([0]), states)).toEqual({ ids: [0], commonState: 'seated' })
    expect(summarizeSelection(new Set([1, 0]), states)).toEqual({ ids: [0, 1], commonState: 'seated' })
    expect(summarizeSelection(new Set([0, 2]), states)).toEqual({ ids: [0, 2], commonState: null })
  })
})
