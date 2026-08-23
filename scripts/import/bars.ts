import type { Bar, Duration, LyricSyllable, Note } from '../../src/types'
import { DURATIONS } from '../../src/types'
import { childElements, firstChildNamed, textOf, frameText } from './dom'

export function barsFromMeasures(measures: Element[]): Bar[] {
  return measures.map(measure => ({ notes: notesFromMeasure(measure) }))
}

function notesFromMeasure(measure: Element): Note[] {
  const notes: Note[] = []
  for (const container of eventContainers(measure)) {
    for (const el of childElements(container)) {
      if (el.nodeName === 'Chord') notes.push(chordToNote(el))
      else if (el.nodeName === 'Rest') notes.push(restToNote(el))
    }
  }
  return notes
}

/** Measures wrap their events in <voice>; fall back to the measure itself. */
function eventContainers(measure: Element): Element[] {
  const voices = childElements(measure).filter(el => el.nodeName === 'voice')
  return voices.length > 0 ? voices : [measure]
}

function readDuration(el: Element): Duration {
  const raw = textOf(el, 'durationType')
  if (!raw || !(DURATIONS as readonly string[]).includes(raw)) {
    throw new Error(
      `Unsupported duration "${raw}". The songbook uses only ${DURATIONS.join(', ')}.`,
    )
  }
  return raw as Duration
}

function requireInt(el: Element, childName: string): number {
  const raw = textOf(el, childName)
  if (raw === null || raw === '') throw new Error(`Missing <${childName}>`)
  const value = Number(raw)
  if (!Number.isInteger(value)) throw new Error(`<${childName}> is not an integer: "${raw}"`)
  return value
}

function chordToNote(chord: Element): Note {
  const noteEls = childElements(chord).filter(el => el.nodeName === 'Note')
  if (noteEls.length === 0) throw new Error('Found a <Chord> with no <Note> children')
  const pitches = noteEls.map(el => requireInt(el, 'pitch'))
  return {
    pitch: pitches[0]!,
    tpc: requireInt(noteEls[0]!, 'tpc'),
    extraPitches: pitches.slice(1),
    duration: readDuration(chord),
    lyrics: readLyrics(chord),
  }
}

function restToNote(rest: Element): Note {
  return {
    pitch: null,
    tpc: null,
    extraPitches: [],
    duration: readDuration(rest),
    lyrics: [],
  }
}

/** Absent <no> means line 0; anything present must parse as a non-negative integer. */
function readLyricLine(lyrics: Element): number {
  const raw = textOf(lyrics, 'no')
  if (raw === null || raw === '') return 0
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`<no> is not a valid lyric line number: "${raw}"`)
  }
  return value
}

const SYLLABIC_VALUES: LyricSyllable['syllabic'][] = ['single', 'begin', 'middle', 'end']

function readLyrics(chord: Element): LyricSyllable[] {
  const byLine: LyricSyllable[] = []
  for (const el of childElements(chord).filter(e => e.nodeName === 'Lyrics')) {
    const line = readLyricLine(el)
    const textEl = firstChildNamed(el, 'text')
    const syllabic = textOf(el, 'syllabic') ?? 'single'
    if (!SYLLABIC_VALUES.includes(syllabic as LyricSyllable['syllabic'])) {
      throw new Error(`Unsupported <syllabic> value "${syllabic}"`)
    }
    byLine[line] = {
      text: textEl ? frameText(textEl) : '',
      syllabic: syllabic as LyricSyllable['syllabic'],
    }
  }
  // Fill any gap so consumers can index lines without holes.
  return Array.from(byLine, line => line ?? { text: '', syllabic: 'single' as const })
}
