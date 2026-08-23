import { basename } from 'node:path'
import type { KeyName, KeyVersion, Song } from '../../src/types'
import { KEY_NAMES } from '../../src/types'
import { readMscz } from './mscz'
import { musicStaff, extractSections } from './sections'
import type { SectionText } from './sections'
import { barsFromMeasures } from './bars'
import { systemBreaksFor } from './systems'

/**
 * Matches a key label ('GE', 'AF#', 'DB', 'GA EDC', 'CDEGA C₁', …) and nothing else in
 * the corpus — titles always contain lowercase letters, which this rejects. Position
 * within a frame is not reliable: three frames in the corpus store [label, title]
 * instead of the usual [title, label], so label and title are identified by content.
 */
const KEY_LABEL_PATTERN = /^[A-G][#b₀-₉]?(?:[ ]*[A-G][#b₀-₉]?)*$/

function keyLabelOf(texts: SectionText[], path: string, frameIndex: number): string {
  const matches = texts.filter(t => KEY_LABEL_PATTERN.test(t.text))
  if (matches.length !== 1) {
    throw new Error(
      `${basename(path)}: frame ${frameIndex} has ${matches.length} texts matching the ` +
      `key-label pattern, expected exactly 1`,
    )
  }
  return matches[0]!.text
}

/** The title is whatever's left in the frame once the LEVEL heading and key label are excluded. */
function titleOf(texts: SectionText[], path: string, frameIndex: number): string {
  const candidates = texts.filter(t => t.style !== 'title' && !KEY_LABEL_PATTERN.test(t.text))
  if (candidates.length !== 1) {
    throw new Error(
      `${basename(path)}: frame ${frameIndex} has ${candidates.length} texts left after ` +
      `removing the LEVEL heading and key label, expected exactly 1 title`,
    )
  }
  return candidates[0]!.text
}

export function slugify(title: string): string {
  return title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')                 // strip combining diacritics
    .replace(/[^\p{ASCII}]/gu, '')          // drop non-ASCII (e.g. 茉莉花)
    .toLowerCase()
    .replace(/['’]/g, '')                   // I'm -> im
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function levelFromFilename(path: string): 1 | 2 | 3 | 4 {
  const match = /Level (\d)/.exec(basename(path))
  if (!match) throw new Error(`No "Level n" in filename: ${basename(path)}`)
  const level = Number(match[1])
  if (level !== 1 && level !== 2 && level !== 3 && level !== 4) {
    throw new Error(`Level ${level} is outside 1-4 in ${basename(path)}`)
  }
  return level
}

export function buildSong(path: string): Song {
  const sections = extractSections(musicStaff(readMscz(path)))
  if (sections.length !== KEY_NAMES.length) {
    throw new Error(
      `${basename(path)}: expected ${KEY_NAMES.length} key sections, found ${sections.length}`,
    )
  }

  // Each frame's title must agree — a strong guard against a mis-split section.
  const titles = sections.map((section, index) => titleOf(section.texts, path, index))
  const title = titles[0]!
  if (titles.some(t => t !== title)) {
    throw new Error(`${basename(path)}: frames disagree on title: ${titles.join(' / ')}`)
  }

  const keys = {} as Record<KeyName, KeyVersion>
  KEY_NAMES.forEach((keyName, index) => {
    const section = sections[index]!
    const bars = barsFromMeasures(section.measures)
    keys[keyName] = {
      label: keyLabelOf(section.texts, path, index),
      bars,
      systemBreaks: systemBreaksFor(bars.length),
    }
  })

  const barCounts = KEY_NAMES.map(k => keys[k].bars.length)
  if (new Set(barCounts).size !== 1) {
    throw new Error(`${basename(path)}: key sections differ in length: ${barCounts.join(', ')}`)
  }

  return {
    id: slugify(title),
    title,
    level: levelFromFilename(path),
    timeSignature: [4, 4],
    keys,
    defaultTempo: 100,
  }
}
