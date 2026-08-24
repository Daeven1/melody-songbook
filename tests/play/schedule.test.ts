import { describe, it, expect } from 'vitest'
import songsJson from '../../src/data/songs.json'
import bordunsJson from '../../src/data/borduns.json'
import type { Song, Bordun } from '../../src/types'
import { buildSchedule, songDurationSeconds, flattenNotes, COUNT_IN_BEATS, BORDUN_PLAYBACK_SHIFT } from '../../src/play/schedule'

const SONGS = songsJson as unknown as Song[]
const BORDUNS = bordunsJson as unknown as Bordun[]
const goodnight = SONGS.find(s => s.id === 'good-night-sleep-tight')!
const chord = BORDUNS.find(b => b.id === 'chord')!
const broken = BORDUNS.find(b => b.id === 'broken')!

// At 120 bpm one beat is 0.5s, so the 4-beat count-in ends and the song starts at 2.0s.
const opts = { song: goodnight, key: 'C' as const, bordun: chord, bpm: 120, repeats: 1 }

describe('constants', () => {
  it('counts in for four beats and drops the bordun two octaves', () => {
    expect(COUNT_IN_BEATS).toBe(4)
    expect(BORDUN_PLAYBACK_SHIFT).toBe(-24)
  })
})

describe('flattenNotes', () => {
  it('flattens bars into one note list', () => {
    expect(flattenNotes(goodnight, 'C')).toHaveLength(11)
  })
})

describe('songDurationSeconds', () => {
  it('is bars x 4 beats', () => {
    expect(songDurationSeconds(goodnight, 'C', 120)).toBeCloseTo(4.0, 6)   // 2 bars
    const moLiHua = SONGS.find(s => s.id === 'mo-li-hua')!
    expect(songDurationSeconds(moLiHua, 'C', 120)).toBeCloseTo(16.0, 6)    // 8 bars
  })
})

describe('buildSchedule — count-in', () => {
  const events = buildSchedule(opts)
  it('emits four metronome clicks before the song', () => {
    const countIn = events.filter(e => e.kind === 'metronome' && e.time < 2.0)
    expect(countIn.map(e => e.time)).toEqual([0, 0.5, 1.0, 1.5])
  })
  it('marks the first count-in click as beat 0 for accenting', () => {
    expect(events.find(e => e.kind === 'metronome')!.beatInBar).toBe(0)
  })
})

describe('buildSchedule — melody', () => {
  const melody = buildSchedule(opts).filter(e => e.kind === 'melody')

  it('places every note at its exact time', () => {
    // 4 quarters then 6 eighths then a quarter, starting at 2.0s
    expect(melody.map(e => e.time)).toEqual([
      2.0, 2.5, 3.0, 3.5, 4.0, 4.25, 4.5, 4.75, 5.0, 5.25, 5.5,
    ])
  })

  it('carries the sounding pitch unshifted', () => {
    expect(melody[0]!.pitches).toEqual([67])
  })

  it('numbers notes so the cursor can index them', () => {
    expect(melody.map(e => e.noteIndex)).toEqual([0,1,2,3,4,5,6,7,8,9,10])
  })

  it('gives each note its sounding length', () => {
    expect(melody[0]!.durationSeconds).toBeCloseTo(0.5, 6)
    expect(melody[4]!.durationSeconds).toBeCloseTo(0.25, 6)
  })

  it('alternates mallets for the melody instrument', () => {
    expect(melody.slice(0, 4).map(e => e.hand)).toEqual(['L', 'R', 'L', 'R'])
  })
})

describe('buildSchedule — bordun', () => {
  it('drops the written pitch two octaves', () => {
    const first = buildSchedule(opts).find(e => e.kind === 'bordun')!
    expect(first.pitches).toEqual([72 - 24, 79 - 24])   // C5+G5 written -> C3+G3 sounding
    expect(first.hand).toBe('both')
  })

  it('repeats the one-bar pattern under every bar', () => {
    const bordun = buildSchedule(opts).filter(e => e.kind === 'bordun')
    // chord bordun is 2 half notes per bar, 2 bars => 4 events
    expect(bordun.map(e => e.time)).toEqual([2.0, 3.0, 4.0, 5.0])
  })

  it('places a four-event pattern on every beat', () => {
    const bordun = buildSchedule({ ...opts, bordun: broken }).filter(e => e.kind === 'bordun')
    expect(bordun.map(e => e.time)).toEqual([2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5])
    expect(bordun.slice(0, 4).map(e => e.hand)).toEqual(['L', 'R', 'L', 'R'])
  })
})

describe('buildSchedule — rests', () => {
  it('advances time but emits no melody event', () => {
    const pumpkin = SONGS.find(s => s.id === 'pumpkin-pumpkin')!
    const notes = flattenNotes(pumpkin, 'C')
    const restCount = notes.filter(n => n.pitch === null).length
    expect(restCount).toBeGreaterThan(0)
    const melody = buildSchedule({ ...opts, song: pumpkin }).filter(e => e.kind === 'melody')
    expect(melody).toHaveLength(notes.length - restCount)
  })
})

describe('buildSchedule — repeats', () => {
  it('counts in once, then repeats the song back to back', () => {
    const events = buildSchedule({ ...opts, repeats: 2 })
    expect(events.filter(e => e.kind === 'metronome' && e.time < 2.0)).toHaveLength(4)
    const melody = events.filter(e => e.kind === 'melody')
    expect(melody).toHaveLength(22)
    expect(melody[11]!.time).toBeCloseTo(6.0, 6)      // second pass starts one song-length later
    expect(melody[11]!.noteIndex).toBe(0)             // index restarts so the cursor resets
  })

  it('clicks the metronome through every repeat', () => {
    const events = buildSchedule({ ...opts, repeats: 2 })
    // 4 count-in + 16 song beats (2 bars x 2 repeats x 4 beats)
    expect(events.filter(e => e.kind === 'metronome')).toHaveLength(20)
  })
})

describe('buildSchedule — ordering', () => {
  it('returns events sorted by time', () => {
    const times = buildSchedule(opts).map(e => e.time)
    expect(times).toEqual([...times].sort((a, b) => a - b))
  })
})

describe('buildSchedule — tempo', () => {
  it('scales every time inversely with bpm', () => {
    const slow = buildSchedule({ ...opts, bpm: 60 }).filter(e => e.kind === 'melody')
    expect(slow[0]!.time).toBeCloseTo(4.0, 6)   // count-in is 4 beats of 1s
    expect(slow[1]!.time).toBeCloseTo(5.0, 6)
  })
})

describe('buildSchedule — validation', () => {
  it('rejects a tempo outside the usable range', () => {
    expect(() => buildSchedule({ ...opts, bpm: 0 })).toThrow(/bpm/i)
    expect(() => buildSchedule({ ...opts, bpm: -5 })).toThrow(/bpm/i)
  })
  it('rejects a repeat count below 1', () => {
    expect(() => buildSchedule({ ...opts, repeats: 0 })).toThrow(/repeat/i)
  })
})
