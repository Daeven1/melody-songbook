import { describe, it, expect } from 'vitest'
import songs from '../../src/data/songs.json'
import type { Song, KeyName } from '../../src/types'
import { KEY_NAMES } from '../../src/types'
import { KEY_TRANSPOSITIONS, transposeBars } from '../../src/music/transpose'
import { spelledName } from '../../src/music/pitch'

const ALL = songs as unknown as Song[]

describe('key transposition rules', () => {
  it('moves up a tone, a fourth and a fifth', () => {
    expect(KEY_TRANSPOSITIONS.C).toEqual({ semitones: 0, tpcShift: 0 })
    expect(KEY_TRANSPOSITIONS.D).toEqual({ semitones: 2, tpcShift: 2 })
    expect(KEY_TRANSPOSITIONS.F).toEqual({ semitones: 5, tpcShift: -1 })
    expect(KEY_TRANSPOSITIONS.G).toEqual({ semitones: 7, tpcShift: 1 })
  })
})

/**
 * Documented octave exceptions to note-for-note agreement.
 *
 * `ece-has-a-music-room` and `shake-them-simmons-down` both have a C-key version
 * that starts on sol (range G4–E5) rather than do. A naive +5/+7 transposition
 * would push their F and G versions up to C5–A5 / D5–B5 — off the top of a
 * soprano xylophone — so the teacher wrote those two sections an octave lower to
 * keep them playable. Every other song starts low enough that no such drop is
 * needed, and transposes with offset 0 in every key.
 *
 * Any future file that introduces a new octave shift must be added here
 * explicitly; until then it fails loudly rather than passing under a permissive
 * rule.
 */
const OCTAVE_OFFSETS: Record<string, Partial<Record<KeyName, number>>> = {
  'ece-has-a-music-room': { F: -12, G: -12 },
  'shake-them-simmons-down': { F: -12, G: -12 },
}

function expectedOffset(songId: string, key: KeyName): number {
  return OCTAVE_OFFSETS[songId]?.[key] ?? 0
}

describe('the authored keys agree with the transposition rules, up to a uniform octave', () => {
  for (const song of ALL) {
    for (const key of KEY_NAMES) {
      it(`${song.id} — key of ${key} matches key of C transposed, up to a documented octave offset`, () => {
        const { semitones, tpcShift } = KEY_TRANSPOSITIONS[key as KeyName]
        const naive = transposeBars(song.keys.C.bars, semitones, tpcShift)
        const actual = song.keys[key].bars

        expect(actual.length).toBe(naive.length)

        // Positional pitch deltas between the naive transposition and what was
        // authored. Rests must line up as rests positionally and contribute no
        // delta — only sounding notes are compared.
        const deltas: number[] = []
        naive.forEach((bar, bi) => {
          const actualNotes = actual[bi]?.notes
          expect(actualNotes).toBeDefined()
          expect(actualNotes!.length).toBe(bar.notes.length)
          bar.notes.forEach((naiveNote, ni) => {
            const actualNote = actualNotes![ni]
            expect(actualNote).toBeDefined()
            expect(actualNote!.pitch === null).toBe(naiveNote.pitch === null)
            if (naiveNote.pitch !== null && actualNote!.pitch !== null) {
              deltas.push(actualNote!.pitch - naiveNote.pitch)
            }
          })
        })

        // A mis-split section produces scattered, non-uniform deltas (or wrong
        // pitch classes); a deliberate register choice produces a single uniform
        // whole-octave offset. Only the latter is permitted.
        const uniqueDeltas = [...new Set(deltas)]
        expect(uniqueDeltas.length).toBeLessThanOrEqual(1)
        const offset = uniqueDeltas[0] ?? 0
        expect(offset % 12 === 0).toBe(true)
        expect(offset).toBe(expectedOffset(song.id, key as KeyName))

        // With the documented offset folded in, the authored bars must match the
        // naive transposition exactly, note for note (pitch, tpc, duration, lyrics).
        expect(transposeBars(song.keys.C.bars, semitones + offset, tpcShift)).toEqual(actual)
      })
    }
  }
})

describe('spelling survives transposition', () => {
  it('spells the D-key version of a C-key F as F sharp, never G flat', () => {
    const goodnight = ALL.find(s => s.id === 'good-night-sleep-tight')!
    const names = goodnight.keys.D.bars
      .flatMap(b => b.notes)
      .filter(n => n.tpc !== null)
      .map(n => spelledName(n.tpc!))
    expect(names).toContain('F#')
    expect(names).not.toContain('Gb')
  })
})

describe('every song uses only the notes its key label sets out', () => {
  for (const song of ALL) {
    for (const key of KEY_NAMES) {
      it(`${song.id} — ${key} notes are within its labelled bars`, () => {
        const version = song.keys[key as KeyName]
        const labelled = new Set(version.label.match(/[A-G]#?/g) ?? [])
        const used = new Set(
          version.bars.flatMap(b => b.notes).filter(n => n.tpc !== null)
            .map(n => spelledName(n.tpc!)),
        )
        for (const note of used) expect(labelled).toContain(note)
      })
    }
  }
})
