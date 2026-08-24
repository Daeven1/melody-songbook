import { childElements, firstChildNamed, textOf, frameText } from './dom'

export interface SectionText {
  style: string
  text: string
}

export interface RawSection {
  texts: SectionText[]
  measures: Element[]
}

/** The one Score-level Staff that holds the music (the Part's Staff is nested inside Part). */
export function musicStaff(doc: Document): Element {
  const score = firstChildNamed(doc.documentElement, 'Score')
  if (!score) throw new Error('No <Score> element')
  const staves = childElements(score).filter(el => el.nodeName === 'Staff')
  if (staves.length !== 1) {
    throw new Error(`Expected exactly 1 music staff, found ${staves.length}`)
  }
  return staves[0]!
}

/** Splits a staff into sections at each title frame (VBox). */
export function extractSections(staff: Element): RawSection[] {
  const sections: RawSection[] = []
  let current: RawSection | null = null

  for (const el of childElements(staff)) {
    if (el.nodeName === 'VBox') {
      current = { texts: readFrameTexts(el), measures: [] }
      sections.push(current)
    } else if (el.nodeName === 'Measure') {
      if (!current) throw new Error('Found a measure before any title frame')
      current.measures.push(el)
    }
  }
  return sections
}

function readFrameTexts(vbox: Element): SectionText[] {
  return childElements(vbox)
    .filter(el => el.nodeName === 'Text')
    .map(el => {
      const textEl = firstChildNamed(el, 'text')
      return {
        style: textOf(el, 'style') ?? '',
        text: textEl ? frameText(textEl) : '',
      }
    })
}
