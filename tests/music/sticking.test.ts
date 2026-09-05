import { describe, it, expect } from 'vitest'
import songsJson from '../../src/data/songs.json'
import { AUTHORED_STICKING, TWO_NOTE_SONGS } from '../../src/data/sticking'
import { malletPositions, phrasesOf, stickingForPhrase, stickingForSong } from '../../src/music/sticking'

const SONGS = songsJson as unknown as {
  id: string
  keys: Record<string, { bars: { notes: { pitch: number | null }[] }[] }>
}[]

const pitchesOf = (id: string, key = 'C') =>
  SONGS.find(s => s.id === id)!.keys[key]!.bars.flatMap(b => b.notes.map(n => n.pitch))

const soundingOf = (id: string, key = 'C') =>
  pitchesOf(id, key).filter((p): p is number => p !== null)

/** Hands as a compact string, for comparing against Lacie's table by eye. */
const handsOf = (id: string, key = 'C') =>
  stickingForSong(id, pitchesOf(id, key)).filter(h => h !== null).join('')

describe('authored sticking aligns with the real songs', () => {
  it('every authored sequence divides its song exactly', () => {
    // A sequence covering one verse is tiled to fill. If it does not divide the
    // note count, the transcription is off and the sticking would silently
    // drift out of step with the melody.
    for (const [id, entry] of Object.entries(AUTHORED_STICKING)) {
      const count = soundingOf(id).length
      expect(
        count % entry.hands.length,
        `${id}: ${entry.hands.length} hands does not divide ${count} notes`,
      ).toBe(0)
    }
  })

  it('gives every sounding note a hand and every rest none', () => {
    for (const song of SONGS) {
      const pitches = pitchesOf(song.id)
      const hands = stickingForSong(song.id, pitches)
      expect(hands.length).toBe(pitches.length)
      pitches.forEach((pitch, i) => {
        if (pitch === null) expect(hands[i], `${song.id} rest at ${i}`).toBeNull()
        else expect(hands[i], `${song.id} note at ${i}`).not.toBeNull()
      })
    }
  })
})

describe("Lacie's examples", () => {
  it('Hot Cross Buns — alternating throughout, now fully specified', () => {
    expect(handsOf('hot-cross-buns')).toBe('RLR' + 'RLR' + 'RLRL' + 'RLRL' + 'RLR')
  })

  it('Peas Porridge Hot — repeated notes alternate, then settle one hand per note', () => {
    expect(handsOf('peas-porridge-hot')).toBe('RLRL' + 'RLRL' + 'LLL' + 'RRR' + 'RLR')
  })

  it('Mary Had a Little Lamb — two verses, fully specified', () => {
    expect(handsOf('mary-had-a-little-lamb')).toBe('RLRLRRRLLLRRR' + 'RLRLRRRLLRLR')
  })

  it('Shake Them Simmons Down — second phrase now ends with both lefts', () => {
    expect(handsOf('shake-them-simmons-down'))
      .toBe('LLLRRLR' + 'LLLRRLL' + 'LLLRRLR' + 'RRLLR')
  })

  it('Bow Wow Wow — do-do-do left, mi-mi-mi-mi alternating, mi-re-do crossover', () => {
    //  do-do-do | mi-mi-mi-mi | so-so-so-la-so-mi-do  mi-re-do
    expect(handsOf('bow-wow-wow')).toBe('LLL' + 'RLRL' + 'RRRRRLL' + 'RLR')
  })

  it('Teddy Bear — the anchor on mi, same nine hands each phrase', () => {
    expect(handsOf('teddy-bear')).toBe('RRLRRLRLR'.repeat(4))
  })

  it('Great Big House — left anchored on mi, closing on a crossover', () => {
    expect(handsOf('great-big-house-in-new-orleans'))
      .toBe('LRRRLRR' + 'LRRRLR' + 'LRRRLRR' + 'LRRLR')
  })

  it('Au Clair de la Lune — the same re takes different hands in different phrases', () => {
    //  do-do-do | re-mi-re | do-mi-re-re-do   ... then the verse repeats
    const hands = handsOf('au-clair-de-la-lune')
    expect(hands).toBe('LLLRRRLRLLR'.repeat(2))
    // The 4th note is re (right), the 9th is also re (left) — the case that
    // rules out any pitch-to-hand mapping.
    expect(hands[3]).toBe('R')
    expect(hands[8]).toBe('L')
  })

  it('mi-mi-re-re-do is right-right-left-left-right in all three songs that use it', () => {
    for (const id of ['ece-has-a-music-room', 'shake-them-simmons-down', 'cut-the-cake']) {
      expect(handsOf(id).slice(-5), id).toBe('RRLLR')
    }
  })

  it('Ring Around the Rosie', () => {
    expect(handsOf('ring-around-the-rosie')).toBe('RRLRRL' + 'RRLRRL' + 'RLRL' + 'RRL')
  })

  it('Mo Li Hua', () => {
    expect(handsOf('mo-li-hua'))
      .toBe('LLLLRRLLLRL' + 'LLLLRRLLLRL' + 'RRRLRRRR' + 'RLRRRLRLRL')
  })

  it('two-note songs put one hand on each note, never alternating', () => {
    for (const id of TWO_NOTE_SONGS) {
      const song = SONGS.find(s => s.id === id)
      if (!song) continue
      const sounding = soundingOf(id)
      const low = Math.min(...sounding)
      const hands = stickingForSong(id, pitchesOf(id)).filter(h => h !== null)
      sounding.forEach((pitch, i) => {
        expect(hands[i], `${id} note ${i}`).toBe(pitch === low ? 'L' : 'R')
      })
    }
  })

  it('Closet Key — two-note sticking with re in the left hand, ending on a crossover', () => {
    expect(handsOf('closet-key')).toBe('LLRRLLRLLRRLR'.repeat(2))
    // The song's final do takes the RIGHT hand — a crossover, and the reason
    // this song is authored rather than derived from scale degree.
    expect(handsOf('closet-key').at(-1)).toBe('R')
  })

  it('sticking is relative — the same hands in every key', () => {
    for (const song of SONGS) {
      const inC = handsOf(song.id, 'C')
      for (const key of ['D', 'F', 'G']) {
        expect(handsOf(song.id, key), `${song.id} in ${key}`).toBe(inC)
      }
    }
  })
})

describe('phrasesOf', () => {
  it('splits on rests, which is how the table is grouped', () => {
    expect(phrasesOf([60, 62, null, 64, 65])).toEqual([
      { indices: [0, 1], pitches: [60, 62] },
      { indices: [2, 3], pitches: [64, 65] },
    ])
  })

  it('matches the phrase groupings in the songs — Teddy Bear is four nines', () => {
    expect(phrasesOf(pitchesOf('teddy-bear')).map(p => p.pitches.length)).toEqual([9, 9, 9, 9])
  })
})

describe('stickingForPhrase — the fallback rules', () => {
  it('two notes get one hand each', () => {
    expect(stickingForPhrase([64, 67, 64, 67])).toEqual(['L', 'R', 'L', 'R'])
  })

  it('a single repeated note alternates', () => {
    expect(stickingForPhrase([67, 67, 67])).toEqual(['L', 'R', 'L'])
  })

  it('anchors the left hand on a low note that keeps returning', () => {
    // mi-so-so-la-mi-so-so — Lacie's own example of the anchor rule.
    expect(stickingForPhrase([64, 67, 67, 69, 64, 67, 67]))
      .toEqual(['L', 'R', 'R', 'R', 'L', 'R', 'R'])
  })

  it('otherwise alternates by group, so a repeated note keeps its hand', () => {
    const hands = stickingForPhrase([76, 76, 74, 74, 72])
    expect(hands).toEqual(['R', 'R', 'L', 'L', 'R'])
  })
})

describe('malletPositions', () => {
  const pitches = [67, 67, 67, 64, 64]
  const hands = stickingForSong('frog-in-the-meadow', pitches)

  it('rests each mallet on the first note it will play', () => {
    expect(malletPositions(pitches, hands, null)).toEqual({ left: 64, right: 67 })
  })

  it('does not send a mallet back to the start once its notes are done', () => {
    expect(malletPositions(pitches, hands, pitches.length)).toEqual({ left: 64, right: 67 })
  })

  it('leaves a mallet unplaced when the music never uses that hand', () => {
    expect(malletPositions([67, 67], ['L', 'L'], null)).toEqual({ left: 67, right: null })
  })
})
