import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Bar } from '../../src/types'
import { DURATION_TICKS, TICKS_PER_BAR } from '../../src/types'
import { PITCH_COLOURS } from '../../src/music/colours'
import { pitchClass } from '../../src/music/pitch'
import { childElements, firstChildNamed, textOf } from './dom'

const SOURCE_DIR = 'source'

export function sourceFiles(): string[] {
  return readdirSync(SOURCE_DIR)
    .filter(name => name.endsWith('.mscz'))
    .sort()
    .map(name => join(SOURCE_DIR, name))
}

export function songFiles(): string[] {
  return sourceFiles().filter(path => !path.includes('Bordun'))
}

export function bordunFile(): string {
  return join(SOURCE_DIR, 'G2 - Bordun Techniques & No Lyrics.mscz')
}

/** Elements the renderer cannot draw. None appear in the corpus today. */
const FORBIDDEN_ELEMENTS = ['Tie', 'Slur', 'Volta', 'Jump', 'Marker', 'Tuplet', 'dots']

export function validateDocument(doc: Document, label: string): void {
  const score = firstChildNamed(doc.documentElement, 'Score')
  if (!score) throw new Error(`${label}: no <Score>`)

  const parts = childElements(score).filter(el => el.nodeName === 'Part')
  if (parts.length !== 1) throw new Error(`${label}: expected 1 Part, found ${parts.length}`)

  const timeSigs = doc.getElementsByTagName('TimeSig')
  for (let i = 0; i < timeSigs.length; i++) {
    const sig = timeSigs[i] as unknown as Element
    const n = textOf(sig, 'sigN')
    const d = textOf(sig, 'sigD')
    if (n !== '4' || d !== '4') throw new Error(`${label}: time signature ${n}/${d}, expected 4/4`)
  }

  for (const tag of FORBIDDEN_ELEMENTS) {
    if (doc.getElementsByTagName(tag).length > 0) {
      throw new Error(`${label}: contains <${tag}>, which the renderer cannot draw`)
    }
  }

  const notes = doc.getElementsByTagName('Note')
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i] as unknown as Element
    const pitch = Number(textOf(note, 'pitch'))
    const colour = firstChildNamed(note, 'color')
    if (!colour) throw new Error(`${label}: a note has no <color>`)
    const actual = [
      Number(colour.getAttribute('r')),
      Number(colour.getAttribute('g')),
      Number(colour.getAttribute('b')),
    ]
    const expected = PITCH_COLOURS[pitchClass(pitch)]
    if (!expected) throw new Error(`${label}: no colour defined for pitch ${pitch}`)
    if (actual.join(',') !== expected.join(',')) {
      throw new Error(
        `${label}: pitch ${pitch} is coloured ${actual.join(',')} but the table says ${expected.join(',')}`,
      )
    }
  }
}

export function validateBars(bars: Bar[], label: string): void {
  bars.forEach((bar, index) => {
    const ticks = bar.notes.reduce((sum, note) => sum + DURATION_TICKS[note.duration], 0)
    if (ticks !== TICKS_PER_BAR) {
      throw new Error(
        `${label}: bar ${index + 1} does not fill a 4/4 bar (${ticks} of ${TICKS_PER_BAR} ticks)`,
      )
    }
  })
}
