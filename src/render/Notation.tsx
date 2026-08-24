import { useEffect, useRef, useState } from 'react'
import { Accidental, Barline, Beam, Formatter, Renderer, Stave, StaveNote, Voice } from 'vexflow'
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

const SYSTEM_HEIGHT = 180
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
/**
 * VexFlow's default line spacing (10 units) is far too tight for a legible
 * letter-in-notehead — a notehead sized to hold a readable letter would
 * overlap the staff lines above and below it. Widening the spacing is what
 * "enlarging the staff" actually means here; the notehead size follows from it.
 */
const STAVE_LINE_SPACING = 26
const STAVE_OPTIONS = { spacingBetweenLinesPx: STAVE_LINE_SPACING }
// A notehead is an ellipse wider than it is tall, tilted like an engraved one —
// not a plain circle. Sized so its rotated vertical half-extent is exactly
// STAVE_LINE_SPACING / 2 (13): a note in a space touches both bounding lines;
// a note on a line reaches the middle of the space above and below it. Both
// cases need the same half-extent, so one size serves both.
const NOTEHEAD_RX = 19
const NOTEHEAD_RY = 12
const NOTEHEAD_TILT_DEGREES = -20
const LYRIC_LINE_HEIGHT = 24
const LYRIC_TOP_GAP = 10
const BOX_MARGIN_X = 10
const BOX_MARGIN_Y = 14
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
  /** The system's real vertical extent — same box the phrase box behind it uses. */
  top: number
  bottom: number
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
      const probeStave = new Stave(LEFT_PAD, 0, MAX_STAVE_WIDTH, STAVE_OPTIONS)
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
    const collectedBoxes: BoxMark[] = []
    const staveBySystem: Stave[] = []
    // Centering a lyric line needs the top of the *next* staff, which does not
    // exist yet while this system is being drawn — collect the syllables now
    // and place them once every system's real, drawn Stave is known.
    const pendingLyrics: { systemIndex: number; x: number; lineIndex: number; text: string }[] = []

    const phraseEntry = PHRASES[song.id]
    const boxSpans = phraseEntry ? phraseBoxSpans(phraseEntry) : []
    const boxesBySystem = splitPhraseBoxesBySystem(boxSpans, systems)

    systems.forEach((bars, systemIndex) => {
      const systemTop = systemIndex * systemStep + 10
      const stave = new Stave(LEFT_PAD, systemTop, staveWidth, STAVE_OPTIONS)
      stave.addClef('treble')
      // No key signature, ever: accidentals are placed per note instead.
      if (systemIndex === 0) stave.addTimeSignature('4/4')
      // Same music start on every line, so notes, lyrics and phrase boxes stack
      // in vertical columns across systems.
      stave.setNoteStartX(stave.getX() + noteStartOffset)
      // A closing double bar only makes sense at the very end of the song.
      if (systemIndex === systems.length - 1) stave.setEndBarType(Barline.type.END)
      stave.setContext(context).draw()
      staveBySystem.push(stave)

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

      // Beams must be generated before the voice is drawn. Beam.generateBeams
      // sets each grouped note's internal .beam reference, which is what makes
      // a note skip drawing its own flag — voice.draw() decides per note,
      // right then, whether to draw a flag. Generating beams afterwards (as
      // this used to) is too late: every eighth had already drawn its flag,
      // so beamed pairs showed a beam *and* a flag on top of it.
      const beams = Beam.generateBeams(notes.filter(n => !n.isRest()))
      voice.draw(context, stave)
      beams.forEach(beam => beam.setContext(context).draw())

      // Record where every note landed, and build the notehead/lyric overlays
      // from the same layout. The staff is rendered once; only the cursor moves.
      const flatNotes = bars.flatMap(bar => bar.notes)

      // The system's real vertical extent, read from the actual drawn stave —
      // NOT derived from systemTop with a hand-tuned offset. A Stave's
      // constructor Y is not where it visually renders (see the lyric-gap
      // comment below), and that gap scales with STAVE_LINE_SPACING, so any
      // fixed offset here goes stale the moment that spacing changes. The
      // cursor and the phrase box behind it share this same box on purpose —
      // the cursor is "the phrase box for whichever note is playing right now".
      const lineYs = [stave.getYForLine(0), stave.getYForLine(4)]
      const systemBoxTop = Math.min(...lineYs) - BOX_MARGIN_Y
      const systemBoxBottom = Math.max(...lineYs) + BOX_MARGIN_Y

      notes.forEach((staveNote, i) => {
        const x = staveNote.getAbsoluteX()
        collectedMarks.push({ x, top: systemBoxTop, bottom: systemBoxBottom })

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
          pendingLyrics.push({ systemIndex, x, lineIndex, text: lyricText(syllable) })
        })
      })

      // Phrase boxes, from bar boundaries to pixel spans, drawn behind the staff.
      const boxTop = systemBoxTop
      const boxBottom = systemBoxBottom

      boxesBySystem
        .filter(box => box.systemIndex === systemIndex)
        .forEach(box => {
          const startRange = barNoteRanges[box.startBar]
          const endRange = barNoteRanges[box.endBar]
          if (!startRange || !endRange) return
          const firstNote = notes[startRange.start]
          const lastNote = notes[endRange.end]
          if (!firstNote || !lastNote) return

          const x1 = firstNote.getAbsoluteX() - (NOTEHEAD_RX + BOX_MARGIN_X)
          const x2 = lastNote.getAbsoluteX() + (NOTEHEAD_RX + BOX_MARGIN_X)
          collectedBoxes.push({
            x: x1,
            y: boxTop,
            width: x2 - x1,
            height: boxBottom - boxTop,
            colour: colourForLetter(box.letter),
          })
        })
    })

    const totalHeight = systems.length * systemStep + 40
    const lyricBlockHeight = maxLyricLines * LYRIC_LINE_HEIGHT
    const lyricBaseYBySystem = staveBySystem.map((stave, systemIndex) => {
      // stave.getBottomY() is not the visible bottom staff line — VexFlow
      // reserves extra room below it (for its own lyric annotations, which we
      // draw ourselves instead), so it sits well past what the eye sees as the
      // staff. getYForLine(4) is the real bottom line, exactly as the phrase-box
      // layout above already uses successfully. Every song in this book has a
      // phrase box, which extends BOX_MARGIN_Y past that line and is drawn on
      // top of it — starting the lyric gap there (not at the bare staff line)
      // keeps the lyric clear of the box instead of nearly touching it.
      const gapTop = stave.getYForLine(4) + BOX_MARGIN_Y
      const nextStave = staveBySystem[systemIndex + 1]
      const gapBottom = nextStave ? nextStave.getYForLine(0) : totalHeight
      const gapHeight = gapBottom - gapTop
      return maxLyricLines === 0
        ? gapTop + LYRIC_TOP_GAP
        : gapTop + Math.max(LYRIC_TOP_GAP, (gapHeight - lyricBlockHeight) / 2)
    })
    const collectedLyrics: LyricMark[] = pendingLyrics.map(lyric => ({
      x: lyric.x,
      y: (lyricBaseYBySystem[lyric.systemIndex] ?? 0) + lyric.lineIndex * LYRIC_LINE_HEIGHT,
      text: lyric.text,
    }))

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
              <ellipse
                cx={note.x} cy={note.y} rx={NOTEHEAD_RX} ry={NOTEHEAD_RY}
                fill={note.fill}
                transform={`rotate(${NOTEHEAD_TILT_DEGREES} ${note.x} ${note.y})`}
              />
              <text
                x={note.x}
                y={note.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={15}
                fontWeight="bold"
                fill={note.textColour}
              >
                {note.letter}
              </text>
            </g>
          ))}

          {lyricMarks.map((lyric, i) => (
            <text key={i} x={lyric.x} y={lyric.y} textAnchor="middle" fontSize={18} fill="currentColor">
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
            y={active.top}
            width={32}
            height={active.bottom - active.top}
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
