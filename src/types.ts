export type Duration = 'half' | 'quarter' | 'eighth'
export type KeyName = 'C' | 'D' | 'F' | 'G'

export const KEY_NAMES = ['C', 'D', 'F', 'G'] as const satisfies readonly KeyName[]
export const DURATIONS = ['half', 'quarter', 'eighth'] as const satisfies readonly Duration[]

/** Ticks per quarter note. MuseScore's <Division> is 480 throughout this corpus. */
export const TICKS_PER_QUARTER = 480
export const TICKS_PER_BAR = TICKS_PER_QUARTER * 4

export const DURATION_TICKS: Record<Duration, number> = {
  half: TICKS_PER_QUARTER * 2,
  quarter: TICKS_PER_QUARTER,
  eighth: TICKS_PER_QUARTER / 2,
}

export interface LyricSyllable {
  text: string
  syllabic: 'single' | 'begin' | 'middle' | 'end'
}

export interface Note {
  /** MIDI note number; null means a rest. */
  pitch: number | null
  /** MuseScore tonal pitch class — determines spelling. null for rests. */
  tpc: number | null
  /** Additional pitches sounding with `pitch`, for bordun dyads. Empty for melodies. */
  extraPitches: number[]
  duration: Duration
  /** Index 0 is the main lyric line, index 1 the romanisation where present. */
  lyrics: LyricSyllable[]
}

export interface Bar {
  notes: Note[]
}

export interface KeyVersion {
  /** Authored label from the title frame, e.g. 'GE', 'DEF#AB', 'GA EDC'. */
  label: string
  bars: Bar[]
  /** Bar indices at which a new system (line) starts. Never includes 0. */
  systemBreaks: number[]
}

export interface Song {
  id: string
  title: string
  level: 1 | 2 | 3 | 4
  timeSignature: [4, 4]
  keys: Record<KeyName, KeyVersion>
  defaultTempo: number
}

export type BordunId =
  | 'chord'
  | 'broken'
  | 'levels'
  | 'crossover'
  | 'crossover-challenge'

export interface BordunEvent {
  /** Zero-based beat within the one-bar pattern. */
  beat: number
  /** Written pitches. Playback applies −24 semitones. */
  pitches: number[]
  duration: Duration
  hand: 'L' | 'R' | 'both'
}

export interface Bordun {
  id: BordunId
  label: string
  isChallenge: boolean
  /** One bar per key, looped under the melody. */
  keys: Record<KeyName, BordunEvent[]>
}
