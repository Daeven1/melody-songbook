import { describe, it, expect } from 'vitest'
import { buildSong, slugify, levelFromFilename } from '../../scripts/import/song'
import { systemBreaksFor } from '../../scripts/import/systems'

const GOODNIGHT = 'source/G2 Melodies Level 1 (Goodnight, Sleep Tight).mscz'
const OLD_MACDONALD = 'source/G2 Melodies Level 3 (Old Macdonald).mscz'
const MO_LI_HUA = 'source/G2 Melodies Level 4 (Mo Lie Hua).mscz'
const FROG = 'source/G2 Melodies Level 1 (Frog in the Meadow).mscz'
const AU_CLAIR = 'source/G2 Melodies Level 2 (Au Clair de la Lune).mscz'
const CLOSET_KEY = 'source/G2 Melodies Level 2 (Closet Key).mscz'

describe('systemBreaksFor', () => {
  it('keeps a two-bar song on one line', () => {
    expect(systemBreaksFor(2)).toEqual([])
  })
  it('splits a four-bar song into two lines of two', () => {
    expect(systemBreaksFor(4)).toEqual([2])
  })
  it('splits an eight-bar song into two lines of four', () => {
    expect(systemBreaksFor(8)).toEqual([4])
  })
})

describe('slugify', () => {
  it('makes a URL-safe id', () => {
    expect(slugify('Good Night, Sleep Tight')).toBe('good-night-sleep-tight')
    expect(slugify("I'm an Acorn")).toBe('im-an-acorn')
    expect(slugify('Mò Lì Huā 茉莉花')).toBe('mo-li-hua')
  })
})

describe('levelFromFilename', () => {
  it('reads the level from the file name', () => {
    expect(levelFromFilename(GOODNIGHT)).toBe(1)
    expect(levelFromFilename(MO_LI_HUA)).toBe(4)
  })
})

describe('buildSong', () => {
  it('assembles all four keys', () => {
    const song = buildSong(GOODNIGHT)
    expect(Object.keys(song.keys)).toEqual(['C', 'D', 'F', 'G'])
    expect(song.keys.C.label).toBe('GE')
    expect(song.keys.D.label).toBe('AF#')
    expect(song.keys.F.label).toBe('CA')
    expect(song.keys.G.label).toBe('DB')
  })

  it('takes the title from the frame and the level from the filename', () => {
    const song = buildSong(OLD_MACDONALD)
    expect(song.title).toBe('ECE Has a Music Room')
    expect(song.level).toBe(3)
    expect(song.id).toBe('ece-has-a-music-room')
  })

  it('strips the LEVEL heading from the title', () => {
    expect(buildSong(GOODNIGHT).title).toBe('Good Night, Sleep Tight')
  })

  it('gives every key the same bar count', () => {
    const song = buildSong(MO_LI_HUA)
    const counts = Object.values(song.keys).map(k => k.bars.length)
    expect(counts).toEqual([8, 8, 8, 8])
  })

  it('computes system breaks per key', () => {
    expect(buildSong(MO_LI_HUA).keys.C.systemBreaks).toEqual([4])
    expect(buildSong(GOODNIGHT).keys.C.systemBreaks).toEqual([])
  })

  it('transposes the four sections by +2, +5 and +7 semitones', () => {
    const song = buildSong(GOODNIGHT)
    const firstPitch = (key: 'C' | 'D' | 'F' | 'G') => song.keys[key].bars[0]!.notes[0]!.pitch
    expect(firstPitch('C')).toBe(67)
    expect(firstPitch('D')).toBe(69)
    expect(firstPitch('F')).toBe(72)
    expect(firstPitch('G')).toBe(74)
  })

  it('identifies the key label by content, not position, when a frame stores title and label in the opposite order', () => {
    // These three frames store their texts as [label, title] instead of the usual
    // [title, label] — the label must still be found correctly by pattern match.
    expect(buildSong(FROG).keys.G.label).toBe('DB')
    expect(buildSong(AU_CLAIR).keys.G.label).toBe('GAB')
    expect(buildSong(CLOSET_KEY).keys.F.label).toBe('FGA')
  })
})
