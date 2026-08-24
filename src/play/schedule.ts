import type { Bordun, KeyName, Note, Song } from '../types'
import { DURATION_TICKS, TICKS_PER_BAR, TICKS_PER_QUARTER } from '../types'

/** Borduns are written high but played on a bass instrument, two octaves below. */
export const BORDUN_PLAYBACK_SHIFT = -24

/** One bar of clicks before the song, once, however many repeats follow. */
export const COUNT_IN_BEATS = 4

export interface TimedEvent {
  /** Seconds from the start of playback. The first count-in click is at 0. */
  time: number
  kind: 'metronome' | 'melody' | 'bordun'
  /** Sounding pitches. Bordun pitches already carry BORDUN_PLAYBACK_SHIFT. */
  pitches: number[]
  durationSeconds: number
  /** Index into flattenNotes(), for melody events only. Restarts each repeat. */
  noteIndex: number | null
  /** 0-based beat within its bar, so the metronome can accent beat 1. */
  beatInBar: number
  hand: 'L' | 'R' | 'both' | null
}

export interface ScheduleOptions {
  song: Song
  key: KeyName
  bordun: Bordun
  bpm: number
  repeats: number
}

export function flattenNotes(song: Song, key: KeyName): Note[] {
  return song.keys[key].bars.flatMap(bar => bar.notes)
}

function beatsPerBar(song: Song): number {
  return song.timeSignature[0]
}

export function songDurationSeconds(song: Song, key: KeyName, bpm: number): number {
  const secondsPerBeat = 60 / bpm
  return song.keys[key].bars.length * beatsPerBar(song) * secondsPerBeat
}

export function buildSchedule({ song, key, bordun, bpm, repeats }: ScheduleOptions): TimedEvent[] {
  if (!Number.isFinite(bpm) || bpm <= 0) {
    throw new Error(`bpm must be a positive number, got ${bpm}`)
  }
  if (!Number.isInteger(repeats) || repeats < 1) {
    throw new Error(`repeats must be a whole number of at least 1, got ${repeats}`)
  }

  const secondsPerBeat = 60 / bpm
  const secondsPerTick = secondsPerBeat / TICKS_PER_QUARTER
  const songStart = COUNT_IN_BEATS * secondsPerBeat
  const songLength = songDurationSeconds(song, key, bpm)
  const bars = song.keys[key].bars
  const events: TimedEvent[] = []

  for (let beat = 0; beat < COUNT_IN_BEATS; beat++) {
    events.push(click(beat * secondsPerBeat, beat, secondsPerBeat))
  }

  for (let pass = 0; pass < repeats; pass++) {
    const passStart = songStart + pass * songLength

    bars.forEach((bar, barIndex) => {
      const barStart = passStart + barIndex * beatsPerBar(song) * secondsPerBeat

      for (let beat = 0; beat < beatsPerBar(song); beat++) {
        events.push(click(barStart + beat * secondsPerBeat, beat, secondsPerBeat))
      }

      for (const event of bordun.keys[key]) {
        events.push({
          time: barStart + event.beat * secondsPerBeat,
          kind: 'bordun',
          pitches: event.pitches.map(p => p + BORDUN_PLAYBACK_SHIFT),
          durationSeconds: DURATION_TICKS[event.duration] * secondsPerTick,
          noteIndex: null,
          beatInBar: event.beat,
          hand: event.hand,
        })
      }
    })

    // Melody is timed across the whole pass so a note is never lost at a barline.
    let ticks = 0
    let noteIndex = 0
    for (const bar of bars) {
      for (const note of bar.notes) {
        const durationTicks = DURATION_TICKS[note.duration]
        if (note.pitch !== null) {
          events.push({
            time: passStart + ticks * secondsPerTick,
            kind: 'melody',
            pitches: [note.pitch, ...note.extraPitches],
            durationSeconds: durationTicks * secondsPerTick,
            noteIndex,
            beatInBar: Math.floor((ticks % TICKS_PER_BAR) / TICKS_PER_QUARTER),
            // Standard Orff sticking: hands alternate across the melody.
            hand: noteIndex % 2 === 0 ? 'L' : 'R',
          })
        }
        ticks += durationTicks
        noteIndex++
      }
    }
  }

  return events.sort((a, b) => a.time - b.time)
}

function click(time: number, beatInBar: number, secondsPerBeat: number): TimedEvent {
  return {
    time,
    kind: 'metronome',
    pitches: [],
    durationSeconds: secondsPerBeat,
    noteIndex: null,
    beatInBar,
    hand: null,
  }
}
