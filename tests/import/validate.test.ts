import { describe, it, expect } from 'vitest'
import { readMscz } from '../../scripts/import/mscz'
import { musicStaff, extractSections } from '../../scripts/import/sections'
import { barsFromMeasures } from '../../scripts/import/bars'
import { validateDocument, validateBars, sourceFiles, songFiles } from '../../scripts/import/validate'

describe('source discovery', () => {
  it('finds 21 files and ignores _superseded', () => {
    const files = sourceFiles()
    expect(files).toHaveLength(21)
    expect(files.every(f => !f.includes('_superseded'))).toBe(true)
  })

  it('separates the 19 song files from the bordun files', () => {
    expect(songFiles()).toHaveLength(19)
  })
})

describe('corpus invariants hold across every file', () => {
  for (const file of sourceFiles()) {
    it(`validates ${file}`, () => {
      const doc = readMscz(file)
      expect(() => validateDocument(doc, file)).not.toThrow()
      for (const section of extractSections(musicStaff(doc))) {
        expect(() => validateBars(barsFromMeasures(section.measures), file)).not.toThrow()
      }
    })
  }
})

describe('validateBars', () => {
  it('rejects a bar that does not fill 4/4', () => {
    const short = [{ notes: [{ pitch: 60, tpc: 14, extraPitches: [], duration: 'quarter' as const, lyrics: [] }] }]
    expect(() => validateBars(short, 'test')).toThrow(/does not fill a 4\/4 bar/)
  })
})
