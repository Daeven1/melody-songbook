import { writeFileSync, mkdirSync } from 'node:fs'
import { readMscz } from './mscz'
import { musicStaff, extractSections } from './sections'
import { barsFromMeasures } from './bars'
import { buildSong } from './song'
import { buildBorduns } from './bordun'
import { validateDocument, validateBars, songFiles, bordunFile } from './validate'

const OUT_DIR = 'src/data'

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true })

  const songs = songFiles().map(path => {
    const doc = readMscz(path)
    validateDocument(doc, path)
    for (const section of extractSections(musicStaff(doc))) {
      validateBars(barsFromMeasures(section.measures), path)
    }
    return buildSong(path)
  })

  const bordunPath = bordunFile()
  validateDocument(readMscz(bordunPath), bordunPath)
  const borduns = buildBorduns(bordunPath)

  const ids = songs.map(s => s.id)
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i)
  if (duplicates.length > 0) throw new Error(`Duplicate song ids: ${duplicates.join(', ')}`)

  writeFileSync(`${OUT_DIR}/songs.json`, JSON.stringify(songs, null, 2) + '\n')
  writeFileSync(`${OUT_DIR}/borduns.json`, JSON.stringify(borduns, null, 2) + '\n')

  console.log(`Imported ${songs.length} songs and ${borduns.length} borduns.`)
  for (const song of songs) {
    console.log(`  L${song.level}  ${song.id.padEnd(28)} ${song.keys.C.bars.length} bars`)
  }
}

main()
