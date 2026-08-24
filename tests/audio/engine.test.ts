import { describe, it, expect } from 'vitest'
import songsJson from '../../src/data/songs.json'
import bordunsJson from '../../src/data/borduns.json'
import type { Song, Bordun } from '../../src/types'
import { buildSchedule } from '../../src/play/schedule'
import { audibleEvents } from '../../src/audio/engine'

const SONGS = songsJson as unknown as Song[]
const BORDUNS = bordunsJson as unknown as Bordun[]
const events = buildSchedule({
  song: SONGS.find(s => s.id === 'good-night-sleep-tight')!,
  key: 'C',
  bordun: BORDUNS.find(b => b.id === 'chord')!,
  bpm: 120,
  repeats: 1,
})

const ALL_ON = { melody: false, bordun: false, metronome: false }

describe('audibleEvents', () => {
  it('passes everything through when nothing is muted', () => {
    expect(audibleEvents(events, ALL_ON)).toHaveLength(events.length)
  })

  it('removes only the muted part', () => {
    const noMelody = audibleEvents(events, { ...ALL_ON, melody: true })
    expect(noMelody.some(e => e.kind === 'melody')).toBe(false)
    expect(noMelody.some(e => e.kind === 'bordun')).toBe(true)
    expect(noMelody.some(e => e.kind === 'metronome')).toBe(true)
  })

  it('can mute every part at once', () => {
    expect(audibleEvents(events, { melody: true, bordun: true, metronome: true })).toEqual([])
  })

  it('does not reorder or mutate the schedule', () => {
    const before = JSON.parse(JSON.stringify(events))
    const filtered = audibleEvents(events, { ...ALL_ON, bordun: true })
    expect(events).toEqual(before)
    expect(filtered.map(e => e.time)).toEqual([...filtered.map(e => e.time)].sort((a, b) => a - b))
  })
})
