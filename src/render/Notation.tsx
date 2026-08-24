import { useEffect, useRef, useState } from 'react'
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
  /** Index into the flattened note list of the note sounding right now, or null. */
  activeNoteIndex?: number | null
}

/** Where a note sits on the page, so the cursor can be laid over it each frame. */
interface NoteMark {
  x: number
  systemTop: number
}

export function Notation({ song, keyName, activeNoteIndex = null }: NotationProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [marks, setMarks] = useState<NoteMark[]>([])
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    host.innerHTML = ''

    const systems = splitIntoSystems(song.keys[keyName])
    const renderer = new Renderer(host, Renderer.Backends.SVG)
    renderer.resize(STAVE_WIDTH + LEFT_PAD * 2, systems.length * SYSTEM_HEIGHT + 40)
    const context = renderer.getContext()
    const collected: NoteMark[] = []

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

      // Record where every note landed. The cursor is drawn as an overlay from
      // these, so the staff is rendered once and only the marker moves.
      const systemTop = systemIndex * SYSTEM_HEIGHT + 10
      notes.forEach(staveNote => {
        collected.push({ x: staveNote.getAbsoluteX(), systemTop })
      })
    })

    setMarks(collected)
    setSize({ width: STAVE_WIDTH + LEFT_PAD * 2, height: systems.length * SYSTEM_HEIGHT + 40 })
  }, [song, keyName])

  const active = activeNoteIndex === null ? null : marks[activeNoteIndex] ?? null

  return (
    <div className="relative w-full">
      <div ref={hostRef} className="w-full" />
      {active && size.width > 0 && (
        <svg
          viewBox={`0 0 ${size.width} ${size.height}`}
          className="absolute inset-0 w-full h-full pointer-events-none"
          aria-hidden="true"
        >
          <rect
            x={active.x - 16}
            y={active.systemTop - 10}
            width={32}
            height={100}
            rx={8}
            fill="rgba(245, 158, 11, 0.30)"
            stroke="rgb(217, 119, 6)"
            strokeWidth={3}
          />
        </svg>
      )}
    </div>
  )
}
