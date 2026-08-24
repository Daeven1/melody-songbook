import { describe, it, expect } from 'vitest'
import { readMscz } from '../../scripts/import/mscz'
import { musicStaff, extractSections } from '../../scripts/import/sections'

const GOODNIGHT = 'source/G2 Melodies Level 1 (Goodnight, Sleep Tight).mscz'
const MO_LI_HUA = 'source/G2 Melodies Level 4 (Mo Lie Hua).mscz'
const OLD_MACDONALD = 'source/G2 Melodies Level 3 (Old Macdonald).mscz'

describe('extractSections', () => {
  it('splits a song into its four key sections', () => {
    const sections = extractSections(musicStaff(readMscz(GOODNIGHT)))
    expect(sections).toHaveLength(4)
    expect(sections.map(s => s.measures.length)).toEqual([2, 2, 2, 2])
  })

  it('reads the level heading, song title and key label from the first frame', () => {
    const [first] = extractSections(musicStaff(readMscz(GOODNIGHT)))
    expect(first!.texts).toEqual([
      { style: 'title', text: 'LEVEL 1:' },
      { style: 'subtitle', text: 'Good Night, Sleep Tight' },
      { style: 'subtitle', text: 'GE' },
    ])
  })

  it('reads later frames as title plus key label only', () => {
    const sections = extractSections(musicStaff(readMscz(GOODNIGHT)))
    expect(sections.map(s => s.texts.at(-1)!.text)).toEqual(['GE', 'AF#', 'CA', 'DB'])
  })

  it('preserves diacritics and Chinese characters', () => {
    const [first] = extractSections(musicStaff(readMscz(MO_LI_HUA)))
    expect(first!.texts[1]!.text).toBe('Mò Lì Huā 茉莉花')
  })

  it('renders the subscript symbol in a key label', () => {
    const [first] = extractSections(musicStaff(readMscz(MO_LI_HUA)))
    expect(first!.texts.at(-1)!.text).toBe('CDEGA C₁')
  })

  it('handles a file whose frames carry no LEVEL heading', () => {
    const sections = extractSections(musicStaff(readMscz(OLD_MACDONALD)))
    expect(sections).toHaveLength(4)
    expect(sections[0]!.texts.map(t => t.text))
      .toEqual(['ECE Has a Music Room', 'GA EDC'])
  })
})
