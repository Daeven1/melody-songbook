import { describe, it, expect } from 'vitest'
import { readMscz } from '../../scripts/import/mscz'
import { musicStaff, extractSections } from '../../scripts/import/sections'
import { barsFromMeasures } from '../../scripts/import/bars'

const GOODNIGHT = 'source/G2 Melodies Level 1 (Goodnight, Sleep Tight).mscz'
const MO_LI_HUA = 'source/G2 Melodies Level 4 (Mo Lie Hua).mscz'
const BORDUNS = 'source/G2 - Bordun Techniques & No Lyrics.mscz'

function firstSectionBars(path: string) {
  const sections = extractSections(musicStaff(readMscz(path)))
  return barsFromMeasures(sections[0]!.measures)
}

describe('barsFromMeasures — Good Night, Sleep Tight in C (golden test)', () => {
  const bars = firstSectionBars(GOODNIGHT)
  const notes = bars.flatMap(b => b.notes)

  it('reads two bars totalling eleven notes', () => {
    expect(bars).toHaveLength(2)
    expect(notes).toHaveLength(11)
  })

  it('reads the exact pitches', () => {
    expect(notes.map(n => n.pitch)).toEqual([67, 64, 67, 64, 67, 67, 64, 64, 67, 67, 64])
  })

  it('reads four quarters, six eighths, then a quarter', () => {
    expect(notes.map(n => n.duration)).toEqual([
      'quarter', 'quarter', 'quarter', 'quarter',
      'eighth', 'eighth', 'eighth', 'eighth', 'eighth', 'eighth',
      'quarter',
    ])
  })

  it('reads one lyric syllable per note', () => {
    expect(notes.map(n => n.lyrics[0]!.text)).toEqual([
      'Good', 'night,', 'sleep', 'tight,',
      'friends', 'will', 'come', 'to', 'mor', 'row', 'night!',
    ])
  })

  it('marks the hyphenated word with syllabic positions', () => {
    expect(notes.slice(7, 10).map(n => n.lyrics[0]!.syllabic))
      .toEqual(['begin', 'middle', 'end'])
  })

  it('records tonal pitch class so spelling survives', () => {
    expect(notes[0]!.tpc).toBe(15)  // G natural
  })

  it('leaves melody notes without extra chord pitches', () => {
    expect(notes.every(n => n.extraPitches.length === 0)).toBe(true)
  })
})

describe('barsFromMeasures — other corpus shapes', () => {
  it('reads a second lyric line where one exists', () => {
    const notes = firstSectionBars(MO_LI_HUA).flatMap(b => b.notes)
    expect(notes[0]!.lyrics[0]!.text).toBe('好')
    expect(notes[0]!.lyrics[1]!.text).toBe('hǎo')
  })

  it('reads rests as notes with a null pitch', () => {
    const sections = extractSections(musicStaff(readMscz(BORDUNS)))
    const crossover = sections.find(s => s.texts[0]!.text === 'Crossover Bordun' && s.texts.length === 1)!
    const notes = barsFromMeasures(crossover.measures).flatMap(b => b.notes)
    expect(notes.at(-1)!.pitch).toBeNull()
    expect(notes.at(-1)!.duration).toBe('quarter')
  })

  it('reads a bordun dyad as a pitch plus extra pitches', () => {
    const sections = extractSections(musicStaff(readMscz(BORDUNS)))
    const chord = sections.find(s => s.texts[0]!.text === 'Chord Bordun')!
    const first = barsFromMeasures(chord.measures)[0]!.notes[0]!
    expect(first.pitch).toBe(72)             // C5
    expect(first.extraPitches).toEqual([79])  // G5
    expect(first.duration).toBe('half')
  })
})
