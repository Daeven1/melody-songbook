import { basename } from 'node:path'
import type { Bordun, BordunEvent, BordunId, KeyName } from '../../src/types'
import { DURATION_TICKS, KEY_NAMES, TICKS_PER_QUARTER } from '../../src/types'
import { pitchClass } from '../../src/music/pitch'
import { BORDUN_HANDS } from '../../src/data/bordunHands'
import { readMscz } from './mscz'
import { musicStaff, extractSections } from './sections'
import type { RawSection } from './sections'
import { barsFromMeasures } from './bars'
import { childElements, firstChildNamed, frameText } from './dom'

/** Four distinct frame titles, but "Crossover Bordun" yields two ids, so five patterns. */
const PATTERN_COUNT = 5

const PATTERN_IDS: Record<string, BordunId> = {
  'Chord Bordun': 'chord',
  'Broken Bordun': 'broken',
  'Levels Bordun': 'levels',
  'Crossover Bordun': 'crossover',
}

/** The canonical frame title for every id except the challenge variant, which shares one. */
const TITLE_OF_PATTERN: Record<string, string> = Object.fromEntries(
  Object.entries(PATTERN_IDS).map(([title, id]) => [id, title]),
)

/**
 * The printed book's page order — distinct from both the source file's frame order
 * (levels, broken, chord, crossover-challenge, crossover) and Map insertion order.
 * Callers building buttons/pages from this array rely on this order directly.
 */
const PAGE_ORDER: readonly BordunId[] = ['chord', 'broken', 'levels', 'crossover', 'crossover-challenge']

/** Tonic pitch class of each songbook key. */
const KEY_BY_TONIC: Record<number, KeyName> = { 0: 'C', 2: 'D', 5: 'F', 7: 'G' }

/**
 * Finds the text of every <StaffText> anywhere inside a section's measures.
 *
 * Bordun-specific quirk, not a general DOM concern: in this corpus the *CHALLENGE*
 * marker for the D, F and G crossover frames is engraved as a <StaffText> inside the
 * first measure, rather than as a <Text> in the title frame's <VBox> the way the C
 * frame's marker is.
 */
function staffTextsIn(measures: Element[]): string[] {
  const texts: string[] = []
  const visit = (el: Element): void => {
    for (const child of childElements(el)) {
      if (child.nodeName === 'StaffText') {
        const textEl = firstChildNamed(child, 'text')
        if (textEl) texts.push(frameText(textEl))
      }
      visit(child)
    }
  }
  for (const measure of measures) visit(measure)
  return texts
}

/**
 * Classifies a "Crossover Bordun" frame by musical shape — the plain pattern ends on a
 * rest, the challenge pattern ends on a sounding note — then cross-checks that verdict
 * against whatever *CHALLENGE* annotation is present, wherever it lives. The marker's
 * absence is not a disagreement (most crossover frames carry none at all); only a
 * present-but-contradictory marker is. Exported for direct unit testing of the rule.
 */
export function classifyCrossover(title: string, isMarked: boolean, endsOnRest: boolean): BordunId {
  const id: BordunId = endsOnRest ? 'crossover' : 'crossover-challenge'
  if (isMarked !== (id === 'crossover-challenge')) {
    throw new Error(
      `Bordun "${title}" (bar ends ${endsOnRest ? 'on a rest' : 'on a sounding note'}) ` +
      `disagrees with its *CHALLENGE* annotation (${isMarked ? 'present' : 'absent'})`,
    )
  }
  return id
}

function isMarkedChallenge(section: RawSection): boolean {
  return (
    section.texts.some(t => t.text.includes('CHALLENGE')) ||
    staffTextsIn(section.measures).some(t => t.includes('CHALLENGE'))
  )
}

export function buildBorduns(path: string): Bordun[] {
  const sections = extractSections(musicStaff(readMscz(path)))
  const expected = PATTERN_COUNT * KEY_NAMES.length
  if (sections.length !== expected) {
    throw new Error(`${basename(path)}: expected ${expected} bordun frames, found ${sections.length}`)
  }

  const collected = new Map<BordunId, Partial<Record<KeyName, BordunEvent[]>>>()

  for (const section of sections) {
    // The title frame carries the pattern name. Both crossover frames share this exact
    // title, so patterns are matched by title text alone, and the two crossover
    // variants are told apart below.
    const title = section.texts[0]!.text
    const base = PATTERN_IDS[title]
    if (!base) throw new Error(`Unrecognised bordun pattern title "${title}"`)

    const bars = barsFromMeasures(section.measures)
    if (bars.length !== 1) {
      throw new Error(`Bordun "${title}" should be one bar, found ${bars.length}`)
    }
    const notes = bars[0]!.notes

    let id: BordunId = base
    if (base === 'crossover') {
      const lastNote = notes[notes.length - 1]
      if (!lastNote) throw new Error(`Bordun "${title}" has no notes`)
      id = classifyCrossover(title, isMarkedChallenge(section), lastNote.pitch === null)
    }

    const hands = BORDUN_HANDS[id]
    const events: BordunEvent[] = []
    let ticks = 0
    notes.forEach((note, index) => {
      const hand = hands[index]
      if (!hand) throw new Error(`No hand assigned for event ${index} of bordun "${id}"`)
      events.push({
        beat: ticks / TICKS_PER_QUARTER,
        pitches: note.pitch === null ? [] : [note.pitch, ...note.extraPitches],
        duration: note.duration,
        hand,
      })
      ticks += DURATION_TICKS[note.duration]
    })

    const tonic = events.find(e => e.pitches.length > 0)?.pitches[0]
    if (tonic === undefined) throw new Error(`Bordun "${title}" has no sounding note`)
    const keyName = KEY_BY_TONIC[pitchClass(tonic)]
    if (!keyName) {
      throw new Error(`Bordun "${title}" is in an unexpected key (tonic pitch class ${pitchClass(tonic)})`)
    }

    if (!collected.has(id)) collected.set(id, {})
    collected.get(id)![keyName] = events
  }

  const results = [...collected.entries()].map(([id, keys]) => {
    for (const keyName of KEY_NAMES) {
      if (!keys[keyName]) throw new Error(`Bordun "${id}" is missing the key of ${keyName}`)
    }
    // Label is derived from pattern identity, not from whichever frame's title text
    // happened to be parsed last — the file marks only one of the four frames per
    // pattern, so taking it from a frame would be arbitrary.
    const label = id === 'crossover-challenge'
      ? `${TITLE_OF_PATTERN.crossover} *CHALLENGE*`
      : TITLE_OF_PATTERN[id]!
    return {
      id,
      label,
      isChallenge: id === 'crossover-challenge',
      keys: keys as Record<KeyName, BordunEvent[]>,
    }
  })

  // Emit in the book's printed page order, not Map insertion order (which is the
  // source file's frame order).
  return [...results].sort((a, b) => PAGE_ORDER.indexOf(a.id) - PAGE_ORDER.indexOf(b.id))
}
