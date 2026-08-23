import { describe, it, expect } from 'vitest'
import { DOMParser } from '@xmldom/xmldom'
import { readMscz } from '../../scripts/import/mscz'
import { musicStaff, extractSections } from '../../scripts/import/sections'
import { barsFromMeasures } from '../../scripts/import/bars'
import { validateDocument, validateBars, sourceFiles, songFiles } from '../../scripts/import/validate'

function docFromXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'text/xml') as unknown as Document
}

/** Minimal valid <museScore> shell: one Part, one Staff, and whatever body is given. */
function scoreWithStaffBody(staffBody: string): Document {
  return docFromXml(`
    <museScore>
      <Score>
        <Part></Part>
        <Staff>${staffBody}</Staff>
      </Score>
    </museScore>
  `)
}

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

describe('validateDocument — rejects repeat barlines', () => {
  it('rejects a <startRepeat>', () => {
    const doc = scoreWithStaffBody('<Measure><voice><startRepeat/></voice></Measure>')
    expect(() => validateDocument(doc, 'test')).toThrow('contains <startRepeat>')
  })

  it('rejects an <endRepeat>', () => {
    const doc = scoreWithStaffBody('<Measure><voice><endRepeat/></voice></Measure>')
    expect(() => validateDocument(doc, 'test')).toThrow('contains <endRepeat>')
  })
})

describe('validateDocument — rejects pitches outside the instrument range', () => {
  it('rejects a pitch below the range', () => {
    const doc = scoreWithStaffBody(
      '<Measure><voice><Chord><Note><pitch>30</pitch><tpc>14</tpc></Note></Chord></voice></Measure>',
    )
    expect(() => validateDocument(doc, 'test')).toThrow(/pitch 30 is outside the instrument range/)
  })

  it('rejects a pitch above the range', () => {
    const doc = scoreWithStaffBody(
      '<Measure><voice><Chord><Note><pitch>110</pitch><tpc>14</tpc></Note></Chord></voice></Measure>',
    )
    expect(() => validateDocument(doc, 'test')).toThrow(/pitch 110 is outside the instrument range/)
  })
})
