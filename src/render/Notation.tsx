import { useEffect, useRef } from 'react'
import { Accidental, Beam, Formatter, Renderer, Stave, StaveNote, Voice } from 'vexflow'
import type { KeyName, Song } from '../types'
import { splitIntoSystems } from './systems'
import { vexDuration, vexKey } from './vexNotes'
import { accidentalSymbol } from '../music/pitch'

const SYSTEM_HEIGHT = 150
const LEFT_PAD = 20
const STAVE_WIDTH = 900

export interface NotationProps {
  song: Song
  keyName: KeyName
}

export function Notation({ song, keyName }: NotationProps) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    host.innerHTML = ''

    const systems = splitIntoSystems(song.keys[keyName])
    const renderer = new Renderer(host, Renderer.Backends.SVG)
    renderer.resize(STAVE_WIDTH + LEFT_PAD * 2, systems.length * SYSTEM_HEIGHT + 40)
    const context = renderer.getContext()

    systems.forEach((bars, systemIndex) => {
      const stave = new Stave(LEFT_PAD, systemIndex * SYSTEM_HEIGHT + 10, STAVE_WIDTH)
      stave.addClef('treble')
      // No key signature, ever: accidentals are placed per note instead.
      if (systemIndex === 0) stave.addTimeSignature('4/4')
      stave.setContext(context).draw()

      const notes = bars.flatMap(bar =>
        bar.notes.map(note => {
          const staveNote = new StaveNote({ keys: [vexKey(note)], duration: vexDuration(note) })
          if (note.tpc !== null) {
            const symbol = accidentalSymbol(note.tpc)
            if (symbol) staveNote.addModifier(new Accidental(symbol), 0)
          }
          return staveNote
        }),
      )

      const voice = new Voice({ numBeats: bars.length * 4, beatValue: 4 })
      voice.setStrict(false)
      voice.addTickables(notes)
      new Formatter().joinVoices([voice]).format([voice], STAVE_WIDTH - 80)
      voice.draw(context, stave)

      Beam.generateBeams(notes.filter(n => !n.isRest())).forEach(beam => {
        beam.setContext(context).draw()
      })
    })
  }, [song, keyName])

  return <div ref={hostRef} className="w-full overflow-x-auto" />
}
