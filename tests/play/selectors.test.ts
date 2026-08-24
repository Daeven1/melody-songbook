import { describe, it, expect } from 'vitest'
import songsJson from '../../src/data/songs.json'
import bordunsJson from '../../src/data/borduns.json'
import type { Song, Bordun } from '../../src/types'
import { buildSchedule } from '../../src/play/schedule'
import {
  activeMelodyIndexAt, activeBordunPitchesAt, activeBordunHandAt, countInBeatAt, scheduleEndSeconds,
} from '../../src/play/selectors'

const SONGS = songsJson as unknown as Song[]
const BORDUNS = bordunsJson as unknown as Bordun[]
const goodnight = SONGS.find(s => s.id === 'good-night-sleep-tight')!
const chord = BORDUNS.find(b => b.id === 'chord')!

// 120 bpm: count-in 0-2.0s, melody at 2.0,2.5,3.0,3.5,4.0,4.25,...,5.5, ending 6.0
const events = buildSchedule({ song: goodnight, key: 'C', bordun: chord, bpm: 120, repeats: 1 })

describe('activeMelodyIndexAt', () => {
  it('lights nothing during the count-in', () => {
    expect(activeMelodyIndexAt(events, 0)).toBeNull()
    expect(activeMelodyIndexAt(events, 1.9)).toBeNull()
  })

  it('lights a note from the instant it sounds', () => {
    expect(activeMelodyIndexAt(events, 2.0)).toBe(0)
  })

  it('keeps a note lit for its whole duration', () => {
    expect(activeMelodyIndexAt(events, 2.49)).toBe(0)
    expect(activeMelodyIndexAt(events, 2.5)).toBe(1)
  })

  it('tracks the eighth notes', () => {
    expect(activeMelodyIndexAt(events, 4.0)).toBe(4)
    expect(activeMelodyIndexAt(events, 4.26)).toBe(5)
  })

  it('lights the last note until the song ends, then nothing', () => {
    expect(activeMelodyIndexAt(events, 5.99)).toBe(10)
    expect(activeMelodyIndexAt(events, 6.0)).toBeNull()
    expect(activeMelodyIndexAt(events, 99)).toBeNull()
  })

  it('restarts the index on a repeat', () => {
    const twice = buildSchedule({ song: goodnight, key: 'C', bordun: chord, bpm: 120, repeats: 2 })
    expect(activeMelodyIndexAt(twice, 5.99)).toBe(10)
    expect(activeMelodyIndexAt(twice, 6.0)).toBe(0)
  })
})

describe('activeBordunPitchesAt', () => {
  it('sounds nothing during the count-in', () => {
    expect(activeBordunPitchesAt(events, 1.0)).toEqual([])
  })

  it('holds the dyad for its written length', () => {
    expect(activeBordunPitchesAt(events, 2.0)).toEqual([48, 55])   // C3+G3
    expect(activeBordunPitchesAt(events, 2.9)).toEqual([48, 55])
  })

  it('is empty after the song ends', () => {
    expect(activeBordunPitchesAt(events, 99)).toEqual([])
  })
})

describe('activeBordunHandAt', () => {
  it('is null during the count-in and after the song ends', () => {
    expect(activeBordunHandAt(events, 1.0)).toBeNull()
    expect(activeBordunHandAt(events, 99)).toBeNull()
  })

  it('reads the pattern\'s authored hand, not a guess from pitch count', () => {
    // Chord is a dyad on every beat, authored 'both' throughout.
    expect(activeBordunHandAt(events, 2.0)).toBe('both')
  })

  it('alternates hands for a single-pitch pattern — this is the bug that shipped', () => {
    // Broken Bordun alternates one pitch at a time (L, R, L, R). A selector that
    // infers hand from "how many pitches are sounding" sees 1 every time and
    // would return the same hand for all four beats — silently teaching every
    // student to strike with one mallet only.
    const broken = BORDUNS.find(b => b.id === 'broken')!
    const brokenEvents = buildSchedule({ song: goodnight, key: 'C', bordun: broken, bpm: 120, repeats: 1 })
    // count-in ends at 2.0s; broken bordun is 4 quarters per bar at 120bpm (0.5s each)
    const hands = [2.0, 2.5, 3.0, 3.5].map(t => activeBordunHandAt(brokenEvents, t))
    expect(hands).toEqual(['L', 'R', 'L', 'R'])
  })
})

describe('countInBeatAt', () => {
  it('counts 1 to 4 during the count-in', () => {
    expect(countInBeatAt(events, 0)).toBe(1)
    expect(countInBeatAt(events, 0.5)).toBe(2)
    expect(countInBeatAt(events, 1.0)).toBe(3)
    expect(countInBeatAt(events, 1.5)).toBe(4)
  })
  it('is null once the song has started', () => {
    expect(countInBeatAt(events, 2.0)).toBeNull()
  })
})

describe('scheduleEndSeconds', () => {
  it('is the end of the last sounding event', () => {
    expect(scheduleEndSeconds(events)).toBeCloseTo(6.0, 6)
  })
})
