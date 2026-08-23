import { describe, it, expect } from 'vitest'
import { buildBorduns, classifyCrossover } from '../../scripts/import/bordun'
import { BORDUN_HANDS } from '../../src/data/bordunHands'

const BORDUNS = 'source/G2 - Bordun Techniques & No Lyrics.mscz'
const borduns = buildBorduns(BORDUNS)
const byId = Object.fromEntries(borduns.map(b => [b.id, b]))

describe('buildBorduns', () => {
  it('finds all five patterns', () => {
    expect(borduns.map(b => b.id).sort()).toEqual(
      ['broken', 'chord', 'crossover', 'crossover-challenge', 'levels'],
    )
  })

  it('gives every pattern all four keys', () => {
    for (const bordun of borduns) {
      expect(Object.keys(bordun.keys)).toEqual(['C', 'D', 'F', 'G'])
    }
  })

  it('reads the chord bordun as two dyads of tonic plus fifth', () => {
    expect(byId.chord!.keys.C).toEqual([
      { beat: 0, pitches: [72, 79], duration: 'half', hand: 'both' },
      { beat: 2, pitches: [72, 79], duration: 'half', hand: 'both' },
    ])
  })

  it('reads the broken bordun as four alternating quarters', () => {
    expect(byId.broken!.keys.C.map(e => e.pitches)).toEqual([[72], [79], [72], [79]])
    expect(byId.broken!.keys.C.map(e => e.beat)).toEqual([0, 1, 2, 3])
  })

  it('reads the levels bordun as a low dyad then the octave above', () => {
    expect(byId.levels!.keys.C.map(e => e.pitches)).toEqual([[72, 79], [84, 91]])
  })

  it('reads the crossover bordun with its closing rest', () => {
    expect(byId.crossover!.keys.C.map(e => e.pitches)).toEqual([[72], [79], [84], []])
  })

  it('distinguishes the challenge crossover by its subtitle', () => {
    expect(byId['crossover-challenge']!.isChallenge).toBe(true)
    expect(byId.crossover!.isChallenge).toBe(false)
    expect(byId['crossover-challenge']!.keys.C.map(e => e.pitches))
      .toEqual([[72], [79], [84], [79]])
  })

  it('assigns keys from the tonic rather than file order', () => {
    expect(byId.chord!.keys.D.map(e => e.pitches)).toEqual([[74, 81], [74, 81]])
    expect(byId.chord!.keys.F.map(e => e.pitches)).toEqual([[77, 84], [77, 84]])
    expect(byId.chord!.keys.G.map(e => e.pitches)).toEqual([[79, 86], [79, 86]])
  })

  it('gives every event a hand, one per event in the pattern', () => {
    for (const bordun of borduns) {
      for (const events of Object.values(bordun.keys)) {
        expect(events).toHaveLength(BORDUN_HANDS[bordun.id].length)
        expect(events.every(e => ['L', 'R', 'both'].includes(e.hand))).toBe(true)
      }
    }
  })

  it('resolves both crossover variants for all four keys, from shape alone', () => {
    // Only the C-key challenge frame carries a *CHALLENGE* annotation in the VBox title
    // frame; D, F and G carry it as a <StaffText> inside the measure instead (or, for the
    // plain crossover, not at all). Shape-based classification must resolve all of them.
    expect(Object.keys(byId.crossover!.keys)).toEqual(['C', 'D', 'F', 'G'])
    expect(Object.keys(byId['crossover-challenge']!.keys)).toEqual(['C', 'D', 'F', 'G'])
  })

  it('derives the label from pattern identity, not a parsed frame title', () => {
    expect(byId.crossover!.label).toBe('Crossover Bordun')
    expect(byId['crossover-challenge']!.label).toBe('Crossover Bordun *CHALLENGE*')
  })
})

describe('classifyCrossover', () => {
  it('classifies a marked, sounding-note-ending frame as the challenge variant', () => {
    expect(classifyCrossover('Crossover Bordun', true, false)).toBe('crossover-challenge')
  })

  it('classifies an unmarked, rest-ending frame as the plain variant', () => {
    expect(classifyCrossover('Crossover Bordun', false, true)).toBe('crossover')
  })

  it('throws when a marked frame ends on a rest', () => {
    expect(() => classifyCrossover('Crossover Bordun', true, true))
      .toThrow(/disagrees with its \*CHALLENGE\* annotation/)
  })

  it('throws when an unmarked frame ends on a sounding note', () => {
    expect(() => classifyCrossover('Crossover Bordun', false, false))
      .toThrow(/disagrees with its \*CHALLENGE\* annotation/)
  })
})
