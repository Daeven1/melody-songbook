import { useEffect, useRef, useState } from 'react'
import { Accidental, Beam, Formatter, Renderer, Stave, StaveNote, Voice } from 'vexflow'
import type { KeyName, Song } from '../types'
import { splitIntoSystems } from './systems'
import { vexDuration, vexKey } from './vexNotes'
import { accidentalSymbol, noteLetter } from '../music/pitch'
import { colourForPitch, rgbToCss } from '../music/colours'
import { noteheadLabel, textColourForFill } from './noteheads'
import { colourForLetter, hexToRgba } from './phraseColours'
import { phraseBoxSpans, splitPhraseBoxesBySystem } from './phraseBoxes'
import { lyricText } from './lyrics'
import { PHRASES } from '../data/phrases'

const SYSTEM_HEIGHT = 106
const LEFT_PAD = 20
const MIN_STAVE_WIDTH = 340
const MAX_STAVE_WIDTH = 1400
/** Just enough stave past the final note for a closing barline to sit on. */
const TRAILING_PAD = 24
/**
 * VexFlow's minimum packs notes as tightly as they will legally go. The page is
 * scaled to fit the available height, so a cramped stave renders as a narrow
 * block in the middle of a wide screen. Spreading the music out uses the width
 * a projector actually has.
 */
const SPREAD = 2.4
const NOTEHEAD_RADIUS = 13
const LYRIC_LINE_HEIGHT = 19
const LYRIC_TOP_GAP = 9
const BOX_MARGIN_X = 10
const BOX_MARGIN_Y = 20
const BOX_FILL_ALPHA = 0.12

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

/** A coloured letter notehead, drawn in place of VexFlow's own notehead glyph. */
interface NoteheadMark {
  x: number
  y: number
  fill: string
  textColour: string
  letter: string
}

/** One syllable of lyric text, positioned under its note. */
interface LyricMark {
  x: number
  y: number
  text: string
}

/** A phrase box's pixel rectangle for one system. */
interface BoxMark {
  x: number
  y: number
  width: number
  height: number
  colour: string
}

export function Notation({ song, keyName, activeNoteIndex = null }: NotationProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [marks, setMarks] = useState<NoteMark[]>([])
  const [noteheads, setNoteheads] = useState<NoteheadMark[]>([])
  const [lyricMarks, setLyricMarks] = useState<LyricMark[]>([])
  const [boxMarks, setBoxMarks] = useState<BoxMark[]>([])
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    host.innerHTML = ''

    const version = song.keys[keyName]
    const systems = splitIntoSystems(version)

    // Extra vertical room per system when the song carries one or two lyric lines
    // (au-clair-de-la-lune and mo-li-hua both carry two — main line + romanisation).
    const maxLyricLines = version.bars.reduce(
      (max, bar) => bar.notes.reduce((lineMax, note) => Math.max(lineMax, note.lyrics.length), max),
      0,
    )
    const systemStep = SYSTEM_HEIGHT + maxLyricLines * LYRIC_LINE_HEIGHT

    const renderer = new Renderer(host, Renderer.Backends.SVG)
    // Pass 1 — ask VexFlow what each system actually needs, and where its notes
    // would start. The first system carries a time signature and the others do
    // not, so their note-start positions differ; using the widest for all of
    // them keeps the systems vertically aligned the way the printed book does.
    const probes = systems.map((bars, systemIndex) => {
      const probeStave = new Stave(LEFT_PAD, 0, MAX_STAVE_WIDTH)
      probeStave.addClef('treble')
      if (systemIndex === 0) probeStave.addTimeSignature('4/4')
      const probeNotes = bars.flatMap(bar =>
        bar.notes.map(note => new StaveNote({ keys: [vexKey(note)], duration: vexDuration(note) })),
      )
      const probeVoice = new Voice({ numBeats: bars.length * 4, beatValue: 4 })
      probeVoice.setStrict(false)
      probeVoice.addTickables(probeNotes)
      const minWidth = new Formatter()
        .joinVoices([probeVoice])
        .preCalculateMinTotalWidth([probeVoice])
      return { minWidth, noteStartOffset: probeStave.getNoteStartX() - probeStave.getX() }
    })

    const noteStartOffset = Math.max(...probes.map(p => p.noteStartOffset))
    const contentWidth = Math.max(...probes.map(p => p.minWidth))
    const staveWidth = Math.max(
      MIN_STAVE_WIDTH,
      Math.min(MAX_STAVE_WIDTH, noteStartOffset + contentWidth * SPREAD + TRAILING_PAD),
    )

    renderer.resize(staveWidth + LEFT_PAD * 2, systems.length * systemStep + 40)
    const context = renderer.getContext()

    const collectedMarks: NoteMark[] = []
    const collectedNoteheads: NoteheadMark[] = []
    const collectedLyrics: LyricMark[] = []
    const collectedBoxes: BoxMark[] = []

    const phraseEntry = PHRASES[song.id]
    const boxSpans = phraseEntry ? phraseBoxSpans(phraseEntry) : []
    const boxesBySystem = splitPhraseBoxesBySystem(boxSpans, systems)

    systems.forEach((bars, systemIndex) => {
      const systemTop = systemIndex * systemStep + 10
      const stave = new Stave(LEFT_PAD, systemTop, staveWidth)
      stave.addClef('treble')
      // No key signature, ever: accidentals are placed per note instead.
      if (systemIndex === 0) stave.addTimeSignature('4/4')
      // Same music start on every line, so notes, lyrics and phrase boxes stack
      // in vertical columns across systems.
      stave.setNoteStartX(stave.getX() + noteStartOffset)
      stave.setContext(context).draw()

      // Local bar index -> [start, end] note index within this system's `notes`,
      // so phrase boxes (which are expressed in bars) can be mapped to pixel x.
      const barNoteRanges: { start: number; end: number }[] = []
      let noteCursor = 0

      const notes = bars.flatMap(bar => {
        const start = noteCursor
        const staveNotesForBar = bar.notes.map(note => {
          const staveNote = new StaveNote({ keys: [vexKey(note)], duration: vexDuration(note) })
          if (note.tpc !== null) {
            const symbol = accidentalSymbol(note.tpc)
            if (symbol) staveNote.addModifier(new Accidental(symbol), 0)
          }
          if (!staveNote.isRest()) {
            // Suppress VexFlow's own notehead before drawing — stems and beams
            // still attach at the same position. Our coloured circle replaces it
            // in the overlay SVG once we know where it landed.
            staveNote.setKeyStyle(0, { fillStyle: 'transparent', strokeStyle: 'transparent' })
          }
          noteCursor++
          return staveNote
        })
        barNoteRanges.push({ start, end: noteCursor - 1 })
        return staveNotesForBar
      })

      const voice = new Voice({ numBeats: bars.length * 4, beatValue: 4 })
      voice.setStrict(false)
      voice.addTickables(notes)
      new Formatter().joinVoices([voice]).format([voice], staveWidth - noteStartOffset - TRAILING_PAD)
      voice.draw(context, stave)

      Beam.generateBeams(notes.filter(n => !n.isRest())).forEach(beam => {
        beam.setContext(context).draw()
      })

      // Record where every note landed, and build the notehead/lyric overlays
      // from the same layout. The staff is rendered once; only the cursor moves.
      const flatNotes = bars.flatMap(bar => bar.notes)
      const lyricBaseY = stave.getBottomY() + LYRIC_TOP_GAP

      notes.forEach((staveNote, i) => {
        const x = staveNote.getAbsoluteX()
        collectedMarks.push({ x, systemTop })

        const originalNote = flatNotes[i]
        if (!originalNote) return

        if (!staveNote.isRest() && originalNote.pitch !== null && originalNote.tpc !== null) {
          const rgb = colourForPitch(originalNote.pitch)
          collectedNoteheads.push({
            x,
            y: staveNote.getYs()[0] ?? systemTop,
            fill: rgbToCss(rgb),
            textColour: textColourForFill(rgb),
            letter: noteheadLabel(originalNote.tpc),
          })
        }

        originalNote.lyrics.forEach((syllable, lineIndex) => {
          collectedLyrics.push({
            x,
            y: lyricBaseY + lineIndex * LYRIC_LINE_HEIGHT,
            text: lyricText(syllable),
          })
        })
      })

      // Phrase boxes, from bar boundaries to pixel spans, drawn behind the staff.
      const lineYs = [stave.getYForLine(0), stave.getYForLine(4)]
      const boxTop = Math.min(...lineYs) - BOX_MARGIN_Y
      const boxBottom = Math.max(...lineYs) + BOX_MARGIN_Y

      boxesBySystem
        .filter(box => box.systemIndex === systemIndex)
        .forEach(box => {
          const startRange = barNoteRanges[box.startBar]
          const endRange = barNoteRanges[box.endBar]
          if (!startRange || !endRange) return
          const firstNote = notes[startRange.start]
          const lastNote = notes[endRange.end]
          if (!firstNote || !lastNote) return

          const x1 = firstNote.getAbsoluteX() - (NOTEHEAD_RADIUS + BOX_MARGIN_X)
          const x2 = lastNote.getAbsoluteX() + (NOTEHEAD_RADIUS + BOX_MARGIN_X)
          collectedBoxes.push({
            x: x1,
            y: boxTop,
            width: x2 - x1,
            height: boxBottom - boxTop,
            colour: colourForLetter(box.letter),
          })
        })
    })

    setMarks(collectedMarks)
    // VexFlow sizes its SVG in fixed pixels. The overlays scale with the
    // container, so unless the staff scales the same way the two coordinate
    // systems drift apart — noteheads slide off their stems and phrase boxes
    // stop lining up with barlines. Give the staff the same viewBox mapping.
    const staffSvg = host.querySelector('svg')
    if (staffSvg) {
      staffSvg.setAttribute('viewBox', `0 0 ${staveWidth + LEFT_PAD * 2} ${systems.length * systemStep + 40}`)
      staffSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
      staffSvg.removeAttribute('width')
      staffSvg.removeAttribute('height')
      staffSvg.style.width = '100%'
      staffSvg.style.height = '100%'
      staffSvg.style.display = 'block'
    }

    setNoteheads(collectedNoteheads)
    setLyricMarks(collectedLyrics)
    setBoxMarks(collectedBoxes)
    setSize({ width: staveWidth + LEFT_PAD * 2, height: systems.length * systemStep + 40 })
  }, [song, keyName])

  const active = activeNoteIndex === null ? null : marks[activeNoteIndex] ?? null
  const viewBox = `0 0 ${size.width} ${size.height}`

  return (
    <div
      className="relative h-full max-w-full"
      style={
        size.width > 0
          ? { aspectRatio: `${size.width} / ${size.height}`, width: 'auto' }
          : { width: '100%' }
      }
    >
      {/* Phrase boxes, behind the staff. */}
      {boxMarks.length > 0 && size.width > 0 && (
        <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
          {boxMarks.map((box, i) => (
            <rect
              key={i}
              x={box.x}
              y={box.y}
              width={box.width}
              height={box.height}
              rx={12}
              fill={hexToRgba(box.colour, BOX_FILL_ALPHA)}
              stroke={box.colour}
              strokeWidth={2}
            />
          ))}
        </svg>
      )}

      <div ref={hostRef} className="absolute inset-0" />

      {/* Coloured letter noteheads + lyrics, on top of the staff. */}
      {size.width > 0 && (
        <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
          {noteheads.map((note, i) => (
            <g key={i}>
              <circle cx={note.x} cy={note.y} r={NOTEHEAD_RADIUS} fill={note.fill} />
              <text
                x={note.x}
                y={note.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={11}
                fontWeight="bold"
                fill={note.textColour}
              >
                {note.letter}
              </text>
            </g>
          ))}

          {lyricMarks.map((lyric, i) => (
            <text key={i} x={lyric.x} y={lyric.y} textAnchor="middle" fontSize={14} fill="currentColor">
              {lyric.text}
            </text>
          ))}
        </svg>
      )}

      {/* Cursor, topmost — on top of the note's coloured circle. */}
      {active && size.width > 0 && (
        <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
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
