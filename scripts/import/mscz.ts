import { readFileSync } from 'node:fs'
import { unzipSync } from 'fflate'
import { DOMParser } from '@xmldom/xmldom'

/** Reads a MuseScore archive and returns the parsed .mscx document inside it. */
export function readMscz(path: string): Document {
  const archive = unzipSync(new Uint8Array(readFileSync(path)))
  const entry = Object.keys(archive).find(name => name.endsWith('.mscx'))
  if (!entry) throw new Error(`No .mscx inside ${path}`)
  const xml = new TextDecoder().decode(archive[entry]!)
  return new DOMParser().parseFromString(xml, 'text/xml') as unknown as Document
}
