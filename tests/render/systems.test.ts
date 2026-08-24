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
