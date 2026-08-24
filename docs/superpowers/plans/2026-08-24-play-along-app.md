# Play-Along App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The projector screen itself — a song plays in time with a cursor tracking each note, a coloured xylophone showing the melody, a second showing the selected bordun, and controls the teacher can drive from across the room.

**Architecture:** A pure schedule builder turns (song, key, bordun, tempo, repeats) into a flat list of timed events. Tone.js schedules those events ahead on the audio clock; every animation frame the UI *reads back* the transport's current time and derives what to light. VexFlow draws the staff scaffolding, and we draw the songbook's own identity on top — coloured letter noteheads, explicit accidentals, phrase boxes.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind 3, Tone.js, VexFlow, `vite-plugin-pwa`.

**Spec:** `docs/superpowers/specs/2026-08-23-melody-songbook-playalong-design.md` — read its "What executing the data pipeline changed" section, which supersedes earlier statements.

## Global Constraints

- Node 24 LTS. TypeScript strict (`strict: true`, `noUncheckedIndexedAccess: true`).
- Nothing under `src/` may import `fflate`, `@xmldom/xmldom`, or anything under `scripts/`. The data pipeline is build-time only; the app reads the committed JSON.
- **Audio is scheduled ahead; visuals are read back.** Never drive a visual from a Tone scheduled callback — they fire early by design, so the cursor would lead the sound.
- Bordun playback is **−24 semitones** from written pitch, applied in the schedule builder and nowhere else.
- Count-in is **4 beats**, once, before the first repeat only.
- Repeats: **1** (default), 2, 4, 8, or continuous until stopped.
- Projector only. No mobile or tablet layout, no student input, no accounts.
- Melody, bordun and metronome are independently mutable; all three start **on**.

## Facts measured from the generated data — design against these, do not re-derive

| Fact | Value |
|---|---|
| Melody pitch range | MIDI 60–79 (C4–G5) |
| Melody pitch classes used | C D E F F♯ G A B — never B♭ |
| Melody durations used | `quarter` and `eighth` only — **no half notes** |
| Bordun pitches as written | MIDI 72–98; sounding 48–74 after the −24 shift |
| Bordun durations | `half` and `quarter` |
| Bar counts | 16 songs of 4 bars, 2 of 8, 1 of 2 |
| `systemBreaks` | `[2]` for 16 songs, `[4]` for 2, `[]` for 1 — never more than 2 systems |
| Lyric lines | max 2; only `au-clair-de-la-lune` and `mo-li-hua` have a second |
| Rests | 124 across the corpus, always `quarter` |
| Songs with a phrase `grouping` | 5 (`au-clair`, `ece-has-a-music-room`, `teddy-bear`, `ring-around-the-rosie`, `mo-li-hua`) |

## Interfaces the pipeline already provides

```ts
// src/types.ts
type Duration = 'half' | 'quarter' | 'eighth'
type KeyName = 'C' | 'D' | 'F' | 'G'
const KEY_NAMES: readonly KeyName[]           // ['C','D','F','G']
const TICKS_PER_QUARTER = 480
const TICKS_PER_BAR = 1920
const DURATION_TICKS: Record<Duration, number>

interface LyricSyllable { text: string; syllabic: 'single'|'begin'|'middle'|'end' }
interface Note { pitch: number | null; tpc: number | null; extraPitches: number[]; duration: Duration; lyrics: LyricSyllable[] }
interface Bar { notes: Note[] }
interface KeyVersion { label: string; bars: Bar[]; systemBreaks: number[] }
interface Song { id: string; title: string; level: 1|2|3|4; timeSignature: [4,4]; keys: Record<KeyName, KeyVersion>; defaultTempo: number }
type BordunId = 'chord'|'broken'|'levels'|'crossover'|'crossover-challenge'
interface BordunEvent { beat: number; pitches: number[]; duration: Duration; hand: 'L'|'R'|'both' }
interface Bordun { id: BordunId; label: string; isChallenge: boolean; keys: Record<KeyName, BordunEvent[]> }

// src/music/pitch.ts
pitchClass(midi): number; octaveOf(midi): number; noteLetter(tpc): string
alterationOf(tpc): number; accidentalSymbol(tpc): ''|'#'|'b'|'##'|'bb'; spelledName(tpc): string

// src/music/colours.ts
PITCH_COLOURS: Readonly<Record<number, RGB>>; colourForPitch(midi): RGB; rgbToCss(rgb): string
type RGB = readonly [number, number, number]

// src/data/phrases.ts
interface PhraseEntry { letters: string[]; grouping?: number[] }
PHRASES: Record<string, PhraseEntry>

// src/data/bordunHands.ts — BORDUN_HANDS (provisional, pending Lacie's confirmation)
// src/data/songs.json — Song[] (19)
// src/data/borduns.json — Bordun[] (5, in the book's page order)
```

## Decision: synthesized bell voice, not sampled

The spec lists sourcing a licensed glockenspiel sample set as an open item. **This plan does not block on it.** Tasks 2 uses a Tone.js synth voice with a metallic envelope, which needs no assets, raises no licensing question, and works offline from the first load.

The instrument lives behind one module with a single `triggerNote(pitch, duration, time)` interface, so swapping in real samples later is a change to one file and no callers. The app's job is timing and visual sync; sample realism is an enhancement, not a requirement.

---

### Task 1: The schedule builder

The pure function everything else is timed against. No audio context, no React, no DOM — so its timings can be asserted exactly.

**Files:**
- Create: `src/play/schedule.ts`
- Test: `tests/play/schedule.test.ts`

**Interfaces:**
- Consumes: `src/types.ts`
- Produces:
  - `interface TimedEvent { time: number; kind: 'metronome'|'melody'|'bordun'; pitches: number[]; durationSeconds: number; noteIndex: number | null; beatInBar: number; hand: 'L'|'R'|'both'|null }`
  - `interface ScheduleOptions { song: Song; key: KeyName; bordun: Bordun; bpm: number; repeats: number }`
  - `BORDUN_PLAYBACK_SHIFT = -24`
  - `COUNT_IN_BEATS = 4`
  - `buildSchedule(options: ScheduleOptions): TimedEvent[]`
  - `songDurationSeconds(song: Song, key: KeyName, bpm: number): number`
  - `flattenNotes(song: Song, key: KeyName): Note[]`

- [ ] **Step 1: Write the failing test**

`tests/play/schedule.test.ts`:

```ts
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
    // 4 count-in + 8 song beats (2 bars x 2 repeats x 4 beats)
    expect(events.filter(e => e.kind === 'metronome')).toHaveLength(12)
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/play/schedule.test.ts`
Expected: FAIL — cannot resolve `../../src/play/schedule`

- [ ] **Step 3: Write `src/play/schedule.ts`**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/play/schedule.test.ts`
Expected: PASS

If the melody hand assertion fails, note that rests advance `noteIndex` — check whether alternation should count rests. The test expects `L R L R` across the first four notes of *Good Night*, which has no rests, so it does not disambiguate. Leave the implementation as written and report the ambiguity.

- [ ] **Step 5: Commit**

```bash
git add src/play/schedule.ts tests/play/schedule.test.ts
git commit -m "feat: pure schedule builder for melody, bordun and count-in"
```

---

### Task 2: Pure playback selectors

These answer "what should be lit right now?" from a schedule and a time. They are the heart of the visual sync and are pure, so the sync logic is fully testable with no audio context and no DOM.

**Files:**
- Create: `src/play/selectors.ts`
- Test: `tests/play/selectors.test.ts`

**Interfaces:**
- Consumes: `src/play/schedule.ts`
- Produces:
  - `activeMelodyIndexAt(events: TimedEvent[], time: number): number | null`
  - `activeBordunPitchesAt(events: TimedEvent[], time: number): number[]`
  - `countInBeatAt(events: TimedEvent[], time: number): number | null` — 1..4 during count-in, else null
  - `scheduleEndSeconds(events: TimedEvent[]): number`

- [ ] **Step 1: Write the failing test**

`tests/play/selectors.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import songsJson from '../../src/data/songs.json'
import bordunsJson from '../../src/data/borduns.json'
import type { Song, Bordun } from '../../src/types'
import { buildSchedule } from '../../src/play/schedule'
import {
  activeMelodyIndexAt, activeBordunPitchesAt, countInBeatAt, scheduleEndSeconds,
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/play/selectors.test.ts`
Expected: FAIL — cannot resolve `../../src/play/selectors`

- [ ] **Step 3: Write `src/play/selectors.ts`**

```ts
import type { TimedEvent } from './schedule'

/** The last event of `kind` that has started by `time` and has not yet finished. */
function activeEvent(events: TimedEvent[], time: number, kind: TimedEvent['kind']): TimedEvent | null {
  let found: TimedEvent | null = null
  for (const event of events) {
    if (event.kind !== kind) continue
    if (event.time > time) break                       // events are time-sorted
    if (time < event.time + event.durationSeconds) found = event
  }
  return found
}

export function activeMelodyIndexAt(events: TimedEvent[], time: number): number | null {
  return activeEvent(events, time, 'melody')?.noteIndex ?? null
}

export function activeBordunPitchesAt(events: TimedEvent[], time: number): number[] {
  return activeEvent(events, time, 'bordun')?.pitches ?? []
}

/** 1-based beat during the count-in, or null once the song proper has begun. */
export function countInBeatAt(events: TimedEvent[], time: number): number | null {
  const firstSounding = events.find(e => e.kind !== 'metronome')
  if (!firstSounding || time >= firstSounding.time) return null
  const click = activeEvent(events, time, 'metronome')
  return click ? click.beatInBar + 1 : null
}

export function scheduleEndSeconds(events: TimedEvent[]): number {
  return events
    .filter(e => e.kind !== 'metronome')
    .reduce((end, e) => Math.max(end, e.time + e.durationSeconds), 0)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/play/selectors.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/play/selectors.ts tests/play/selectors.test.ts
git commit -m "feat: pure selectors mapping playback time to what should be lit"
```

---

### Task 3: The instrument and the audio engine

The Tone.js binding. Kept deliberately thin, because everything worth testing was pushed into Tasks 1 and 2.

**The instrument is a synthesized bell voice, not samples** — see the decision above. It lives behind one interface so real samples can replace it without touching a caller.

**Files:**
- Create: `src/audio/instrument.ts`, `src/audio/engine.ts`
- Test: `tests/audio/engine.test.ts`

**Interfaces:**
- Consumes: `src/play/schedule.ts`
- Produces:
  - `interface Instrument { triggerNote(pitches: number[], durationSeconds: number, atTime: number): void; dispose(): void }`
  - `createBellInstrument(): Instrument`
  - `createMetronome(): Instrument`
  - `interface Mutes { melody: boolean; bordun: boolean; metronome: boolean }`
  - `audibleEvents(events: TimedEvent[], mutes: Mutes): TimedEvent[]`
  - `class PlaybackEngine { start(events, mutes): Promise<void>; stop(): void; get currentTime(): number; get isPlaying(): boolean; dispose(): void }`

- [ ] **Step 1: Write the failing test**

Only the pure mute filtering is unit tested; the Tone binding is verified in the browser in Task 4.

`tests/audio/engine.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/audio/engine.test.ts`
Expected: FAIL — cannot resolve `../../src/audio/engine`

- [ ] **Step 3: Install Tone.js**

```bash
npm i tone
```

- [ ] **Step 4: Write `src/audio/instrument.ts`**

```ts
import * as Tone from 'tone'

export interface Instrument {
  triggerNote(pitches: number[], durationSeconds: number, atTime: number): void
  dispose(): void
}

function midiToFrequency(midi: number): number {
  return Tone.Frequency(midi, 'midi').toFrequency()
}

/**
 * A struck-bar voice for both xylophones.
 *
 * Synthesized rather than sampled on purpose: no assets to ship, no licence to
 * clear, and it works offline from the first load. Everything that matters for
 * this app is timing and visual sync. To move to real glockenspiel samples,
 * replace this factory with a Tone.Sampler behind the same interface — no
 * caller changes.
 */
export function createBellInstrument(): Instrument {
  const synth = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 3.2,          // inharmonic partials read as "struck metal"
    modulationIndex: 14,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 1.6, sustain: 0, release: 1.2 },
    modulation: { type: 'square' },
    modulationEnvelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.4 },
  }).toDestination()
  synth.volume.value = -8

  return {
    triggerNote(pitches, durationSeconds, atTime) {
      if (pitches.length === 0) return
      synth.triggerAttackRelease(pitches.map(midiToFrequency), durationSeconds, atTime)
    },
    dispose() {
      synth.dispose()
    },
  }
}

/** Woodblock-ish click. Beat 1 is accented by pitching it up a fifth. */
export function createMetronome(): Instrument {
  const synth = new Tone.MembraneSynth({
    pitchDecay: 0.008,
    octaves: 2,
    envelope: { attack: 0.001, decay: 0.12, sustain: 0 },
  }).toDestination()
  synth.volume.value = -14

  return {
    triggerNote(pitches, _durationSeconds, atTime) {
      // pitches is [accentFlag]: 1 for beat one, 0 otherwise.
      const accented = pitches[0] === 1
      synth.triggerAttackRelease(accented ? 'C5' : 'G4', 0.05, atTime)
    },
    dispose() {
      synth.dispose()
    },
  }
}
```

- [ ] **Step 5: Write `src/audio/engine.ts`**

```ts
import * as Tone from 'tone'
import type { TimedEvent } from '../play/schedule'
import { createBellInstrument, createMetronome, type Instrument } from './instrument'

export interface Mutes {
  melody: boolean
  bordun: boolean
  metronome: boolean
}

/** Drops muted parts. Pure — order and the input array are untouched. */
export function audibleEvents(events: TimedEvent[], mutes: Mutes): TimedEvent[] {
  return events.filter(event => !mutes[event.kind])
}

/**
 * Schedules a whole performance on the audio clock, then gets out of the way.
 *
 * Nothing visual is driven from here. Tone's callbacks fire ahead of real time
 * by design, so the UI reads `currentTime` on each animation frame instead —
 * see src/play/useTransportClock.ts.
 */
export class PlaybackEngine {
  private melody: Instrument | null = null
  private metronome: Instrument | null = null
  private startedAt = 0
  private playing = false

  async start(events: TimedEvent[], mutes: Mutes): Promise<void> {
    await Tone.start()
    this.stop()

    this.melody = createBellInstrument()
    this.metronome = createMetronome()

    const now = Tone.now() + 0.1   // a beat of headroom so the first event is never late
    for (const event of audibleEvents(events, mutes)) {
      const at = now + event.time
      if (event.kind === 'metronome') {
        this.metronome.triggerNote([event.beatInBar === 0 ? 1 : 0], event.durationSeconds, at)
      } else {
        this.melody.triggerNote(event.pitches, event.durationSeconds, at)
      }
    }

    this.startedAt = now
    this.playing = true
  }

  stop(): void {
    this.melody?.dispose()
    this.metronome?.dispose()
    this.melody = null
    this.metronome = null
    this.playing = false
  }

  /** Seconds since playback began, on the audio clock. Negative during the lead-in. */
  get currentTime(): number {
    return this.playing ? Tone.now() - this.startedAt : 0
  }

  get isPlaying(): boolean {
    return this.playing
  }

  dispose(): void {
    this.stop()
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/audio/engine.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 7: Commit**

```bash
git add src/audio package.json package-lock.json tests/audio
git commit -m "feat: synthesized bell instrument and Tone-backed playback engine"
```

---

### Task 4: Transport clock, playback hook, and the first audible milestone

The read-back side of the timing rule, plus a deliberately plain screen that proves the engine works before any pixel effort goes into notation. **At the end of this task the app makes music and shows a moving note index.** Everything after it is presentation.

**Files:**
- Create: `src/play/useTransportClock.ts`, `src/play/usePlayback.ts`, `src/ui/App.tsx`
- Modify: `src/main.tsx` (render `<App />` instead of the placeholder heading)
- Test: manual browser verification (see Step 5) — the logic under these hooks is already covered by Tasks 1–3

**Interfaces:**
- Consumes: `src/play/schedule.ts`, `src/play/selectors.ts`, `src/audio/engine.ts`
- Produces:
  - `useTransportClock(engine: PlaybackEngine, isPlaying: boolean): number`
  - `interface PlaybackState { isPlaying: boolean; time: number; melodyIndex: number | null; bordunPitches: number[]; countInBeat: number | null; play(): void; stop(): void }`
  - `usePlayback(options: { song: Song; key: KeyName; bordun: Bordun; bpm: number; repeats: number; mutes: Mutes }): PlaybackState`

- [ ] **Step 1: Write `src/play/useTransportClock.ts`**

```ts
import { useEffect, useState } from 'react'
import type { PlaybackEngine } from '../audio/engine'

/**
 * Reads the audio clock once per animation frame.
 *
 * This direction matters. Tone schedules audio ahead of real time, so its
 * callbacks fire early — driving the cursor from them would run it ahead of the
 * sound. Instead the audio is scheduled once and the UI asks, every frame, what
 * time it is now.
 */
export function useTransportClock(engine: PlaybackEngine, isPlaying: boolean): number {
  const [time, setTime] = useState(0)

  useEffect(() => {
    if (!isPlaying) {
      setTime(0)
      return
    }
    let frame = 0
    const tick = () => {
      setTime(engine.currentTime)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [engine, isPlaying])

  return time
}
```

- [ ] **Step 2: Write `src/play/usePlayback.ts`**

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Bordun, KeyName, Song } from '../types'
import { PlaybackEngine, type Mutes } from '../audio/engine'
import { buildSchedule } from './schedule'
import { activeBordunPitchesAt, activeMelodyIndexAt, countInBeatAt, scheduleEndSeconds } from './selectors'
import { useTransportClock } from './useTransportClock'

export interface PlaybackOptions {
  song: Song
  key: KeyName
  bordun: Bordun
  bpm: number
  repeats: number
  mutes: Mutes
}

export interface PlaybackState {
  isPlaying: boolean
  time: number
  melodyIndex: number | null
  bordunPitches: number[]
  countInBeat: number | null
  play(): void
  stop(): void
}

export function usePlayback(options: PlaybackOptions): PlaybackState {
  const { song, key, bordun, bpm, repeats, mutes } = options
  const engineRef = useRef<PlaybackEngine | null>(null)
  if (engineRef.current === null) engineRef.current = new PlaybackEngine()
  const engine = engineRef.current

  const [isPlaying, setIsPlaying] = useState(false)
  const time = useTransportClock(engine, isPlaying)

  const events = useMemo(
    () => buildSchedule({ song, key, bordun, bpm, repeats }),
    [song, key, bordun, bpm, repeats],
  )

  const stop = useCallback(() => {
    engine.stop()
    setIsPlaying(false)
  }, [engine])

  const play = useCallback(() => {
    void engine.start(events, mutes).then(() => setIsPlaying(true))
  }, [engine, events, mutes])

  // Stop when the performance runs out, so the cursor does not hang on the last note.
  const endsAt = useMemo(() => scheduleEndSeconds(events), [events])
  useEffect(() => {
    if (isPlaying && time > endsAt) stop()
  }, [isPlaying, time, endsAt, stop])

  useEffect(() => () => engine.dispose(), [engine])

  return {
    isPlaying,
    time,
    melodyIndex: isPlaying ? activeMelodyIndexAt(events, time) : null,
    bordunPitches: isPlaying ? activeBordunPitchesAt(events, time) : [],
    countInBeat: isPlaying ? countInBeatAt(events, time) : null,
    play,
    stop,
  }
}
```

- [ ] **Step 3: Write a plain harness `src/ui/App.tsx`**

Deliberately ugly. Its whole job is to prove the engine before presentation work starts.

```tsx
import { useState } from 'react'
import songsJson from '../data/songs.json'
import bordunsJson from '../data/borduns.json'
import type { Bordun, KeyName, Song } from '../types'
import { KEY_NAMES } from '../types'
import { usePlayback } from '../play/usePlayback'
import { flattenNotes } from '../play/schedule'

const SONGS = songsJson as unknown as Song[]
const BORDUNS = bordunsJson as unknown as Bordun[]

export function App() {
  const [songId, setSongId] = useState(SONGS[0]!.id)
  const [key, setKey] = useState<KeyName>('C')
  const [bordunId, setBordunId] = useState(BORDUNS[0]!.id)
  const [bpm, setBpm] = useState(100)

  const song = SONGS.find(s => s.id === songId)!
  const bordun = BORDUNS.find(b => b.id === bordunId)!
  const notes = flattenNotes(song, key)

  const playback = usePlayback({
    song, key, bordun, bpm, repeats: 1,
    mutes: { melody: false, bordun: false, metronome: false },
  })

  return (
    <div className="p-8 font-mono text-sm">
      <h1 className="text-xl mb-4">{song.title} — key of {key} ({song.keys[key].label})</h1>

      <div className="flex gap-2 mb-2">
        <select value={songId} onChange={e => setSongId(e.target.value)} className="border p-1">
          {SONGS.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
        <select value={key} onChange={e => setKey(e.target.value as KeyName)} className="border p-1">
          {KEY_NAMES.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
        <select value={bordunId} onChange={e => setBordunId(e.target.value as Bordun['id'])} className="border p-1">
          {BORDUNS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
        </select>
        <input type="number" value={bpm} min={40} max={180}
               onChange={e => setBpm(Number(e.target.value))} className="border p-1 w-20" />
        <button onClick={playback.isPlaying ? playback.stop : playback.play} className="border px-3">
          {playback.isPlaying ? 'Stop' : 'Play'}
        </button>
      </div>

      <div className="mb-4">
        {playback.countInBeat !== null
          ? <span className="text-2xl">count-in {playback.countInBeat}</span>
          : <span>t = {playback.time.toFixed(2)}s</span>}
      </div>

      <div className="flex flex-wrap gap-1">
        {notes.map((note, i) => (
          <span key={i}
                className={`px-2 py-1 border ${playback.melodyIndex === i ? 'bg-yellow-300 font-bold' : ''}`}>
            {note.pitch === null ? '·' : note.lyrics[0]?.text || note.pitch}
          </span>
        ))}
      </div>

      <div className="mt-4">bordun sounding: {playback.bordunPitches.join(', ') || '—'}</div>
    </div>
  )
}
```

- [ ] **Step 4: Point `src/main.tsx` at it**

```tsx
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './ui/App'

createRoot(document.getElementById('root')!).render(<App />)
```

- [ ] **Step 5: Verify in the browser — this is the milestone**

Start the dev server and open the app. Check all of the following, and record what you observed in your report:

1. Pressing **Play** produces four metronome clicks, then the melody sounds
2. The highlighted lyric advances **in time with the sound** — watch a long note and a run of eighths; the highlight must not lead or lag
3. The bordun sounds **below** the melody, not above
4. Changing the tempo and pressing Play again changes the speed
5. Changing the key changes the pitch; changing the bordun changes the accompaniment
6. Playback stops on its own at the end and the highlight clears
7. The browser console is free of errors and warnings

If the highlight leads the sound, the read-back rule has been broken somewhere — do not compensate with an offset constant, find the callback that is driving a visual and fix the direction.

- [ ] **Step 6: Run the full suite and commit**

```bash
npx vitest run
git add src/play src/ui src/main.tsx
git commit -m "feat: transport clock, playback hook, and a plain harness screen"
```

---

### Task 5: The xylophones

Two SVG instruments drawn from the student's viewpoint, low notes on the left, with F♯ raised above the row exactly as the removable chromatic bar sits on a real Orff instrument. Bars outside the current key's pentatonic are dimmed — the on-screen equivalent of physically taking bars off.

Ranges are fixed per instrument, measured from the data: the melody instrument spans **MIDI 60–79**, the bordun instrument spans its sounding range **MIDI 48–74**.

**Files:**
- Create: `src/render/xylophoneLayout.ts`, `src/render/Xylophone.tsx`
- Test: `tests/render/xylophoneLayout.test.ts`

**Interfaces:**
- Consumes: `src/types.ts`, `src/music/pitch.ts`, `src/music/colours.ts`
- Produces:
  - `interface XylophoneBar { midi: number; name: string; letter: string; isChromatic: boolean; position: number; colour: RGB }`
  - `MELODY_RANGE: readonly [60, 79]`, `BORDUN_SOUNDING_RANGE: readonly [48, 74]`
  - `barsForRange(lowMidi: number, highMidi: number): XylophoneBar[]`
  - `pentatonicPitchClasses(key: KeyName): number[]`
  - `<Xylophone bars={…} litPitches={…} keyName={…} hand={…} label={…} />`

- [ ] **Step 1: Write the failing test**

`tests/render/xylophoneLayout.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  barsForRange, pentatonicPitchClasses, MELODY_RANGE, BORDUN_SOUNDING_RANGE,
} from '../../src/render/xylophoneLayout'

describe('barsForRange', () => {
  const bars = barsForRange(60, 72)   // C4 up to C5

  it('lays out the diatonic bars in order', () => {
    expect(bars.filter(b => !b.isChromatic).map(b => b.name))
      .toEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'])
  })

  it('numbers the diatonic bars consecutively', () => {
    expect(bars.filter(b => !b.isChromatic).map(b => b.position))
      .toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  it('raises F sharp and sits it between F and G', () => {
    const fSharp = bars.find(b => b.name === 'F#4')!
    expect(fSharp.isChromatic).toBe(true)
    expect(fSharp.position).toBe(3.5)
  })

  it('never includes a B flat, which the songbook does not use', () => {
    expect(barsForRange(48, 84).some(b => b.name.includes('b'))).toBe(false)
  })

  it('colours each bar by its pitch', () => {
    expect(bars.find(b => b.name === 'G4')!.colour).toEqual([0, 156, 149])
    expect(bars.find(b => b.name === 'E4')!.colour).toEqual([255, 243, 43])
  })

  it('covers the measured melody and bordun ranges', () => {
    expect(MELODY_RANGE).toEqual([60, 79])
    expect(BORDUN_SOUNDING_RANGE).toEqual([48, 74])
    const melody = barsForRange(...MELODY_RANGE)
    expect(melody[0]!.name).toBe('C4')
    expect(melody.at(-1)!.name).toBe('G5')
  })
})

describe('pentatonicPitchClasses', () => {
  it('gives the five bars set out for each key', () => {
    expect(pentatonicPitchClasses('C')).toEqual([0, 2, 4, 7, 9])    // C D E G A
    expect(pentatonicPitchClasses('D')).toEqual([2, 4, 6, 9, 11])   // D E F# A B
    expect(pentatonicPitchClasses('F')).toEqual([0, 2, 5, 7, 9])    // F G A C D
    expect(pentatonicPitchClasses('G')).toEqual([2, 4, 7, 9, 11])   // G A B D E
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/render/xylophoneLayout.test.ts`
Expected: FAIL — cannot resolve `../../src/render/xylophoneLayout`

- [ ] **Step 3: Write `src/render/xylophoneLayout.ts`**

```ts
import type { KeyName } from '../types'
import { colourForPitch, type RGB } from '../music/colours'
import { octaveOf, pitchClass } from '../music/pitch'

/** Measured from the generated data: every melody note falls in this range. */
export const MELODY_RANGE = [60, 79] as const

/** Bordun sounding range, i.e. written pitch plus the -24 playback shift. */
export const BORDUN_SOUNDING_RANGE = [48, 74] as const

const DIATONIC = [0, 2, 4, 5, 7, 9, 11]         // C D E F G A B
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B']

/** The only chromatic bar the songbook ever needs. B flat never appears. */
const CHROMATIC = new Map<number, { letter: string; below: number }>([
  [6, { letter: 'F', below: 5 }],               // F# sits between F and G
])

export interface XylophoneBar {
  midi: number
  name: string
  letter: string
  isChromatic: boolean
  /** Along the row. Diatonic bars are whole numbers; a chromatic bar sits at x.5. */
  position: number
  colour: RGB
}

export function barsForRange(lowMidi: number, highMidi: number): XylophoneBar[] {
  const bars: XylophoneBar[] = []
  let position = 0

  for (let midi = lowMidi; midi <= highMidi; midi++) {
    const pc = pitchClass(midi)
    const octave = octaveOf(midi)
    const diatonicIndex = DIATONIC.indexOf(pc)

    if (diatonicIndex !== -1) {
      const letter = LETTERS[diatonicIndex]!
      bars.push({
        midi, letter, name: `${letter}${octave}`,
        isChromatic: false, position, colour: colourForPitch(midi),
      })
      position++
      continue
    }

    const chromatic = CHROMATIC.get(pc)
    if (!chromatic) continue                     // a pitch the songbook never uses

    // Raised bars sit above the gap between the diatonic bar below and the next.
    const belowPosition = bars.findLast(b => !b.isChromatic && pitchClass(b.midi) === chromatic.below)?.position
    if (belowPosition === undefined) continue     // its lower neighbour is out of range
    bars.push({
      midi, letter: chromatic.letter, name: `${chromatic.letter}#${octave}`,
      isChromatic: true, position: belowPosition + 0.5, colour: colourForPitch(midi),
    })
  }

  return bars.sort((a, b) => a.position - b.position)
}

const TONIC_PITCH_CLASS: Record<KeyName, number> = { C: 0, D: 2, F: 5, G: 7 }

/** The five bars set out for a key: do re mi sol la. */
export function pentatonicPitchClasses(key: KeyName): number[] {
  const tonic = TONIC_PITCH_CLASS[key]
  return [0, 2, 4, 7, 9].map(step => (tonic + step) % 12).sort((a, b) => a - b)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/render/xylophoneLayout.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: Write `src/render/Xylophone.tsx`**

```tsx
import type { KeyName } from '../types'
import { rgbToCss } from '../music/colours'
import { pitchClass } from '../music/pitch'
import { pentatonicPitchClasses, type XylophoneBar } from './xylophoneLayout'

const BAR_WIDTH = 46
const BAR_GAP = 6
const ROW_HEIGHT = 96
const CHROMATIC_HEIGHT = 62
const CHROMATIC_LIFT = 52

export interface XylophoneProps {
  bars: XylophoneBar[]
  /** Sounding pitches to light right now. */
  litPitches: number[]
  keyName: KeyName
  /** Which mallet struck, for the strike marker. */
  hand: 'L' | 'R' | 'both' | null
  label: string
}

export function Xylophone({ bars, litPitches, keyName, hand, label }: XylophoneProps) {
  const inKey = new Set(pentatonicPitchClasses(keyName))
  const lit = new Set(litPitches)
  const span = Math.max(...bars.map(b => b.position)) + 1
  const width = span * (BAR_WIDTH + BAR_GAP)

  return (
    <figure className="w-full">
      <figcaption className="sr-only">{label}</figcaption>
      <svg viewBox={`0 0 ${width} ${ROW_HEIGHT + CHROMATIC_LIFT}`} className="w-full" role="img" aria-label={label}>
        {bars.map(bar => {
          const isLit = lit.has(bar.midi)
          const dimmed = !inKey.has(pitchClass(bar.midi))
          const x = bar.position * (BAR_WIDTH + BAR_GAP)
          const y = bar.isChromatic ? 0 : CHROMATIC_LIFT
          const height = bar.isChromatic ? CHROMATIC_HEIGHT : ROW_HEIGHT

          return (
            <g key={bar.midi} opacity={dimmed && !isLit ? 0.22 : 1}>
              <rect
                x={x} y={y} width={BAR_WIDTH} height={height} rx={6}
                fill={rgbToCss(bar.colour)}
                stroke={isLit ? '#111' : 'rgba(0,0,0,0.25)'}
                strokeWidth={isLit ? 4 : 1.5}
              />
              <text
                x={x + BAR_WIDTH / 2} y={y + height / 2} textAnchor="middle" dominantBaseline="central"
                fontSize={20} fontWeight={700} fill="#1a1a1a" pointerEvents="none"
              >
                {bar.letter}{bar.isChromatic ? '♯' : ''}
              </text>
              {isLit && (
                // The mallet strike lands in the centre of the bar.
                <circle cx={x + BAR_WIDTH / 2} cy={y + height / 2} r={16}
                        fill="none" stroke="#111" strokeWidth={4} opacity={0.85} />
              )}
            </g>
          )
        })}
      </svg>
      {hand && <p className="text-center text-sm opacity-70">{hand === 'both' ? 'both hands' : `${hand} hand`}</p>}
    </figure>
  )
}
```

- [ ] **Step 6: Show both instruments in the harness and verify in the browser**

In `src/ui/App.tsx`, render a melody `Xylophone` above the note strip and a bordun one below it:

```tsx
import { Xylophone } from '../render/Xylophone'
import { barsForRange, MELODY_RANGE, BORDUN_SOUNDING_RANGE } from '../render/xylophoneLayout'

const MELODY_BARS = barsForRange(...MELODY_RANGE)
const BORDUN_BARS = barsForRange(...BORDUN_SOUNDING_RANGE)
```

```tsx
<Xylophone bars={MELODY_BARS} keyName={key} label="Melody xylophone"
           litPitches={playback.melodyIndex === null ? [] : (notes[playback.melodyIndex]?.pitch ? [notes[playback.melodyIndex]!.pitch!] : [])}
           hand={playback.melodyIndex === null ? null : (playback.melodyIndex % 2 === 0 ? 'L' : 'R')} />
```

```tsx
<Xylophone bars={BORDUN_BARS} keyName={key} label="Bordun xylophone"
           litPitches={playback.bordunPitches} hand={null} />
```

Verify in the browser and record what you saw: bars are in Boomwhacker colours low-to-high left to right; F♯ sits raised between F and G; out-of-key bars are dimmed and re-dim when the key changes; the melody bar lights in time with the sound; the bordun instrument lights **two** bars together for the chord bordun and alternating single bars for the broken one.

- [ ] **Step 7: Run the full suite and commit**

```bash
npx vitest run
git add src/render tests/render src/ui/App.tsx
git commit -m "feat: coloured Orff xylophones with raised F sharp and out-of-key dimming"
```

---

### Task 6: Notation — systems, VexFlow note mapping, and the staff

VexFlow draws the scaffolding: stave, treble clef, time signature, barlines, stems, beams, ledger lines. The songbook's own identity — coloured letter noteheads, phrase boxes, lyrics — is drawn on top in Tasks 7 and 8.

Two pure modules first, so the fiddly parts are testable without a canvas.

**Files:**
- Create: `src/render/systems.ts`, `src/render/vexNotes.ts`, `src/render/Notation.tsx`
- Test: `tests/render/systems.test.ts`, `tests/render/vexNotes.test.ts`

**Interfaces:**
- Consumes: `src/types.ts`, `src/music/pitch.ts`
- Produces:
  - `splitIntoSystems(version: KeyVersion): Bar[][]`
  - `vexKey(note: Note): string` — e.g. `'g/4'`, `'f#/4'`
  - `vexDuration(note: Note): string` — `'q'`, `'8'`, `'h'`, with `'r'` appended for rests
  - `REST_KEY = 'b/4'`
  - `<Notation song={…} keyName={…} />`

- [ ] **Step 1: Write the failing tests**

`tests/render/systems.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import songsJson from '../../src/data/songs.json'
import type { Song } from '../../src/types'
import { splitIntoSystems } from '../../src/render/systems'

const SONGS = songsJson as unknown as Song[]
const byId = (id: string) => SONGS.find(s => s.id === id)!

describe('splitIntoSystems', () => {
  it('keeps a two-bar song on one line', () => {
    const systems = splitIntoSystems(byId('good-night-sleep-tight').keys.C)
    expect(systems.map(s => s.length)).toEqual([2])
  })

  it('splits a four-bar song into two lines of two', () => {
    const systems = splitIntoSystems(byId('frog-in-the-meadow').keys.C)
    expect(systems.map(s => s.length)).toEqual([2, 2])
  })

  it('splits an eight-bar song into two lines of four', () => {
    const systems = splitIntoSystems(byId('mo-li-hua').keys.C)
    expect(systems.map(s => s.length)).toEqual([4, 4])
  })

  it('preserves bar order and loses no bar', () => {
    for (const song of SONGS) {
      const version = song.keys.C
      const systems = splitIntoSystems(version)
      expect(systems.flat()).toEqual(version.bars)
    }
  })

  it('never produces more than two systems, matching the corpus', () => {
    for (const song of SONGS) {
      expect(splitIntoSystems(song.keys.C).length).toBeLessThanOrEqual(2)
    }
  })
})
```

`tests/render/vexNotes.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import songsJson from '../../src/data/songs.json'
import type { Note, Song } from '../../src/types'
import { vexKey, vexDuration, REST_KEY } from '../../src/render/vexNotes'

const SONGS = songsJson as unknown as Song[]
const note = (pitch: number | null, tpc: number | null, duration: Note['duration']): Note =>
  ({ pitch, tpc, extraPitches: [], duration, lyrics: [] })

describe('vexKey', () => {
  it('maps a natural to letter/octave', () => {
    expect(vexKey(note(67, 15, 'quarter'))).toBe('g/4')   // G4
    expect(vexKey(note(60, 14, 'quarter'))).toBe('c/4')   // C4, on a ledger line
  })

  it('spells a sharp as the sharpened letter, never the flattened one above', () => {
    expect(vexKey(note(66, 20, 'quarter'))).toBe('f#/4')  // F#4, not g flat
  })

  it('gives rests a fixed staff position', () => {
    expect(vexKey(note(null, null, 'quarter'))).toBe(REST_KEY)
  })
})

describe('vexDuration', () => {
  it('maps the durations the songbook uses', () => {
    expect(vexDuration(note(67, 15, 'quarter'))).toBe('q')
    expect(vexDuration(note(67, 15, 'eighth'))).toBe('8')
    expect(vexDuration(note(67, 15, 'half'))).toBe('h')
  })

  it('marks a rest', () => {
    expect(vexDuration(note(null, null, 'quarter'))).toBe('qr')
  })
})

describe('every note in the corpus maps cleanly', () => {
  it('produces a key and a duration for all of them', () => {
    for (const song of SONGS) {
      for (const version of Object.values(song.keys)) {
        for (const bar of version.bars) {
          for (const n of bar.notes) {
            expect(vexKey(n)).toMatch(/^[a-g](#|b)?\/\d$/)
            expect(vexDuration(n)).toMatch(/^(h|q|8)r?$/)
          }
        }
      }
    }
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/render/systems.test.ts tests/render/vexNotes.test.ts`
Expected: FAIL — modules do not resolve

- [ ] **Step 3: Write `src/render/systems.ts`**

```ts
import type { Bar, KeyVersion } from '../types'

/**
 * Groups bars into staff lines. `systemBreaks` holds the bar indices at which a
 * new line starts, computed at import time to reproduce the printed book:
 * 2-bar songs stay on one line, longer songs split in half.
 */
export function splitIntoSystems(version: KeyVersion): Bar[][] {
  const boundaries = [0, ...version.systemBreaks, version.bars.length]
  const systems: Bar[][] = []
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i]!
    const end = boundaries[i + 1]!
    if (end > start) systems.push(version.bars.slice(start, end))
  }
  return systems
}
```

- [ ] **Step 4: Write `src/render/vexNotes.ts`**

```ts
import type { Note } from '../types'
import { accidentalSymbol, noteLetter, octaveOf } from '../music/pitch'

/** Rests sit on the middle line regardless of pitch. */
export const REST_KEY = 'b/4'

const VEX_DURATION = { half: 'h', quarter: 'q', eighth: '8' } as const

/** VexFlow key string, e.g. 'f#/4'. Spelling comes from the tonal pitch class. */
export function vexKey(note: Note): string {
  if (note.pitch === null || note.tpc === null) return REST_KEY
  const letter = noteLetter(note.tpc).toLowerCase()
  const accidental = accidentalSymbol(note.tpc)
  return `${letter}${accidental}/${octaveOf(note.pitch)}`
}

export function vexDuration(note: Note): string {
  const base = VEX_DURATION[note.duration]
  return note.pitch === null ? `${base}r` : base
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/render/systems.test.ts tests/render/vexNotes.test.ts`
Expected: PASS

- [ ] **Step 6: Install VexFlow and write `src/render/Notation.tsx`**

```bash
npm i vexflow
```

Accidentals are placed explicitly on every note that needs one and the key signature is always empty — a deliberate departure from the printed book, so a student reading note by note never has to carry a sign forward from earlier in the bar.

```tsx
import { useEffect, useRef } from 'react'
import { Accidental, Beam, Formatter, Renderer, Stave, StaveNote, Voice } from 'vexflow'
import type { KeyName, Song } from '../types'
import { splitIntoSystems } from './systems'
import { vexDuration, vexKey } from './vexNotes'
import { accidentalSymbol } from '../music/pitch'

const SYSTEM_HEIGHT = 150
const LEFT_PAD = 20
const STAVE_WIDTH = 900

export interface NotationProps {
  song: Song
  keyName: KeyName
}

export function Notation({ song, keyName }: NotationProps) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    host.innerHTML = ''

    const systems = splitIntoSystems(song.keys[keyName])
    const renderer = new Renderer(host, Renderer.Backends.SVG)
    renderer.resize(STAVE_WIDTH + LEFT_PAD * 2, systems.length * SYSTEM_HEIGHT + 40)
    const context = renderer.getContext()

    systems.forEach((bars, systemIndex) => {
      const stave = new Stave(LEFT_PAD, systemIndex * SYSTEM_HEIGHT + 10, STAVE_WIDTH)
      stave.addClef('treble')
      // No key signature, ever: accidentals are placed per note instead.
      if (systemIndex === 0) stave.addTimeSignature('4/4')
      stave.setContext(context).draw()

      const notes = bars.flatMap(bar =>
        bar.notes.map(note => {
          const staveNote = new StaveNote({ keys: [vexKey(note)], duration: vexDuration(note) })
          if (note.tpc !== null) {
            const symbol = accidentalSymbol(note.tpc)
            if (symbol) staveNote.addModifier(new Accidental(symbol), 0)
          }
          return staveNote
        }),
      )

      const voice = new Voice({ numBeats: bars.length * 4, beatValue: 4 })
      voice.setStrict(false)
      voice.addTickables(notes)
      new Formatter().joinVoices([voice]).format([voice], STAVE_WIDTH - 80)
      voice.draw(context, stave)

      Beam.generateBeams(notes.filter(n => !n.isRest())).forEach(beam => {
        beam.setContext(context).draw()
      })
    })
  }, [song, keyName])

  return <div ref={hostRef} className="w-full overflow-x-auto" />
}
```

- [ ] **Step 7: Show it in the harness and verify in the browser**

Render `<Notation song={song} keyName={key} />` in `src/ui/App.tsx` above the note strip. Check and record: the staff draws with a treble clef and 4/4 on the first system only; bars appear on the expected number of lines; eighths are beamed; rests appear; the D-key version shows a **sharp before every F♯** and no key signature at the clef; *Mò Lì Huā* shows its low C on a ledger line.

- [ ] **Step 8: Run the full suite and commit**

```bash
npx vitest run
git add src/render tests/render src/ui/App.tsx package.json package-lock.json
git commit -m "feat: VexFlow staff with per-note accidentals and no key signature"
```

---

## ⚠️ PLAN INCOMPLETE — resume here

Tasks 1–6 above are complete and ready to execute. Four tasks remain to be written:

- **Task 7 — Coloured letter noteheads.** Suppress VexFlow's default noteheads and draw a filled circle carrying the pitch letter at each note's reported coordinates, coloured from `colourForPitch`. This is the songbook's visual signature and appears on every note.
- **Task 8 — Lyrics and phrase boxes.** Lyrics drawn as our own text layer rather than VexFlow annotations, because `au-clair-de-la-lune` and `mo-li-hua` need two stacked lines. Phrase boxes as rounded rectangles spanning first note to last note of each phrase, coloured by letter from `PHRASES`, drawn behind the staff. Five songs carry a `grouping`.
- **Task 9 — Wire the screen together.** Cursor travelling to the current note plus that note's circle lighting up, both driven from `playback.melodyIndex`; the three stacked zones at projector proportions.
- **Task 10 — Controls, keyboard shortcuts, PWA, deploy.** Song list, four key buttons, five bordun buttons, tempo, repeat count, play/stop, three mute toggles, fullscreen; spacebar and arrow keys so the app can be driven from across the room; `vite-plugin-pwa` for offline; Vercel deploy.
