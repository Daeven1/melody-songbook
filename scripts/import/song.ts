import { basename } from 'node:path'
import type { KeyName, KeyVersion, Song } from '../../src/types'
import { KEY_NAMES } from '../../src/types'
import { readMscz } from './mscz'
import { musicStaff, extractSections } from './sections'
import { barsFromMeasures } from './bars'
import { systemBreaksFor } from './systems'

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

  // The last text in a frame is the key label; the one before it is the song title.
  const firstTexts = sections[0]!.texts
  if (firstTexts.length < 2) {
    throw new Error(`${basename(path)}: first frame has no title above its key label`)
  }
  const title = firstTexts[firstTexts.length - 2]!.text

  const keys = {} as Record<KeyName, KeyVersion>
  KEY_NAMES.forEach((keyName, index) => {
    const section = sections[index]!
    const bars = barsFromMeasures(section.measures)
    keys[keyName] = {
      label: section.texts.at(-1)!.text,
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
