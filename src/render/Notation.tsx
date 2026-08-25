import { useEffect, useRef, useState } from 'react'
import { Accidental, BarNote, Barline, Beam, Formatter, Renderer, Stave, StaveNote, Stem, Voice } from 'vexflow'
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

/**
 * The distance between two staff lines, and the unit every size below is
 * expressed in.
 *
 * This is VexFlow's OWN default, and staying on it is deliberate. An earlier
 * version enlarged the staff via `spacingBetweenLinesPx`, which stretches the
 * stave geometry (lines, barlines) but leaves everything drawn from the music
 * font — clef, time signature, stems, rests — at its default size. The result
 * was a staff 2.6x too large for its own clef, with stems barely a third the
 * length they should be. Draw at natural scale and let the SVG viewBox magnify
 * the whole picture instead: then every proportion is VexFlow's own, and
 * correct by construction.
 */
const SPACE = 10

const SYSTEM_HEIGHT = SPACE * 7.2
const LEFT_PAD = SPACE * 0.8
const MIN_STAVE_WIDTH = SPACE * 13
const MAX_STAVE_WIDTH = SPACE * 62
/** Just enough stave past the final note for the closing double bar to sit on. */
const TRAILING_PAD = SPACE * 1.2
/**
 * VexFlow's minimum packs notes as tightly as they will legally go. The page is
 * scaled to fit the available height, so a cramped stave renders as a narrow
 * block in the middle of a wide screen. Spreading the music out uses the width
 * a projector actually has.
 */
const SPREAD = 2.6
/**
 * A tilted ellipse, like an engraved notehead. Sized so its rotated vertical
 * half-extent is exactly SPACE / 2: a note in a space touches both bounding
 * lines, and a note on a line reaches the middle of the space above and below.
 * One size serves both cases.
 */
const NOTEHEAD_RX = SPACE * 0.73
const NOTEHEAD_RY = SPACE * 0.46
const NOTEHEAD_TILT_DEGREES = -20
const NOTEHEAD_FONT_SIZE = SPACE * 0.62
/**
 * Stem length, in spaces. Standard engraving is an octave (3.5 spaces), which
 * from a note ON a line ends midway between two lines. From a note in a SPACE
 * the same length would end exactly on a line, which reads as ambiguous, so
 * those get 4 spaces instead — both end clear of a line.
 */
const STEM_SPACES_FROM_LINE = 3.5
const STEM_SPACES_FROM_SPACE = 4
const LYRIC_LINE_HEIGHT = SPACE * 0.95
/**
 * Clearance between a phrase box's bottom edge and the lyric baseline below it.
 * Must exceed the font's ascent (~0.75 of LYRIC_FONT_SIZE) or the text climbs
 * back into the box — which is what happened on the LAST system, where there is
 * no following staff to centre against and this value is used directly.
 */
const LYRIC_TOP_GAP = SPACE * 1.1
const LYRIC_FONT_SIZE = SPACE * 0.72
const BOX_MARGIN_X = SPACE * 0.4
const BOX_MARGIN_Y = SPACE * 0.55
const BOX_FILL_ALPHA = 0.12
/** Breathing room kept around the trimmed content edges. */
const CONTENT_PAD = SPACE * 0.25
/** Half-width of the cursor band that tracks the sounding note. */
const CURSOR_HALF_WIDTH = SPACE * 0.62
/** B4, the middle line in treble clef — the stem-direction boundary. */
const MIDDLE_LINE_MIDI = 71

export interface NotationProps {
  song: Song
  keyName: KeyName
  /** Index into the flattened note list of the note sounding right now, or null. */
  activeNoteIndex?: number | null
}

/**
 * The horizontal centre of a note's head.
 *
 * NOT getAbsoluteX(), which is the note's anchor — the left edge of its
 * notehead. Drawing our ellipse there leaves it offset from the stem, which
 * VexFlow attaches to the head's true edge. Once stems sit on the correct side
 * (left when down, right when up), that offset reads as a detached notehead.
 */
function noteheadCentreX(staveNote: StaveNote): number {
  return (staveNote.getNoteHeadBeginX() + staveNote.getNoteHeadEndX()) / 2
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
  const [size, setSize] = useState({ top: 0, width: 0, height: 0 })

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

    // A generous, deliberately-oversized first pass — trimmed to the real
    // content height below, once the last system's actual geometry is known.
    // Never a tight estimate: SVG content isn't clipped by this initial size,
    // only by the viewBox set at the end, so over-drawing here is free and
    // under-drawing would risk clipping real content before we can measure it.
    renderer.resize(staveWidth + LEFT_PAD * 2, systems.length * systemStep + 400)
    const context = renderer.getContext()

    const collectedMarks: NoteMark[] = []
    const collectedNoteheads: NoteheadMark[] = []
    const collectedBoxes: BoxMark[] = []
    const staveBySystem: Stave[] = []
    const boxTopBySystem: number[] = []
    const boxBottomBySystem: number[] = []
    // Centering a lyric line needs the top of the *next* staff, which does not
    // exist yet while this system is being drawn — collect the syllables now
    // and place them once every system's real, drawn Stave is known.
    const pendingLyrics: { systemIndex: number; x: number; lineIndex: number; text: string }[] = []

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
      // A closing double bar only makes sense at the very end of the song.
      if (systemIndex === systems.length - 1) stave.setEndBarType(Barline.type.END)
      stave.setContext(context).draw()
      staveBySystem.push(stave)

      // Local bar index -> [start, end] note index within this system's `notes`,
      // so phrase boxes (which are expressed in bars) can be mapped to pixel x.
      const barNoteRanges: { start: number; end: number }[] = []
      let noteCursor = 0

      // `notes` holds only the StaveNotes, so overlay indices line up with the
      // song's note list. `tickables` is what the Voice draws — the same notes
      // with a BarNote between bars, which is what puts a barline mid-system.
      const notes: StaveNote[] = []
      const tickables: (StaveNote | BarNote)[] = []

      bars.forEach((bar, barIndex) => {
        if (barIndex > 0) tickables.push(new BarNote(Barline.type.SINGLE))
        const start = noteCursor
        bar.notes.forEach(note => {
          const staveNote = new StaveNote({ keys: [vexKey(note)], duration: vexDuration(note) })
          // A note computes its Y positions when IT is given a stave — not when
          // the voice is. The stem-length pass below reads those positions, so
          // assign the stave here rather than leaving it to voice.draw().
          staveNote.setStave(stave)
          if (note.tpc !== null) {
            const symbol = accidentalSymbol(note.tpc)
            if (symbol) staveNote.addModifier(new Accidental(symbol), 0)
          }
          if (!staveNote.isRest()) {
            // Stem direction by the engraving rule: a notehead on the middle
            // line (B4) or above takes a downward stem on the left of the head,
            // below that an upward stem on the right. VexFlow draws the stem on
            // the correct side once the direction is set.
            if (note.pitch !== null) {
              staveNote.setStemDirection(note.pitch >= MIDDLE_LINE_MIDI ? Stem.DOWN : Stem.UP)
            }
            // Suppress VexFlow's own notehead before drawing — stems and beams
            // still attach at the same position. Our coloured ellipse replaces
            // it in the overlay SVG once we know where it landed.
            staveNote.setKeyStyle(0, { fillStyle: 'transparent', strokeStyle: 'transparent' })
          }
          noteCursor++
          notes.push(staveNote)
          tickables.push(staveNote)
        })
        barNoteRanges.push({ start, end: noteCursor - 1 })
      })

      const voice = new Voice({ numBeats: bars.length * 4, beatValue: 4 })
      voice.setStrict(false)
      voice.addTickables(tickables)
      // Attach the stave BEFORE formatting. A note has no Y position until it
      // knows its stave, and the stem-length pass below reads that position;
      // without this it throws NoYValues, because voice.draw() would otherwise
      // be the first thing to assign one.
      voice.setStave(stave)
      new Formatter().joinVoices([voice]).format([voice], staveWidth - noteStartOffset - TRAILING_PAD)

      // Stem length has to be set after formatting, when each note knows where
      // it sits on the stave. A note ON a line gets the standard octave (3.5
      // spaces), which ends midway between two lines; a note in a SPACE would
      // end exactly on a line at that length, so it gets 4 spaces instead.
      // Either way the stem tip lands clear of a line rather than on one.
      notes.forEach(staveNote => {
        if (staveNote.isRest()) return
        const y = staveNote.getYs()[0]
        if (y === undefined) return
        const spacesFromTopLine = (y - stave.getYForLine(0)) / SPACE
        const sitsOnLine = Math.abs(spacesFromTopLine - Math.round(spacesFromTopLine)) < 0.25
        const spaces = sitsOnLine ? STEM_SPACES_FROM_LINE : STEM_SPACES_FROM_SPACE
        staveNote.setStemLength(spaces * SPACE)
      })

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
        const x = noteheadCentreX(staveNote)
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
      boxTopBySystem.push(boxTop)
      boxBottomBySystem.push(boxBottom)

      boxesBySystem
        .filter(box => box.systemIndex === systemIndex)
        .forEach(box => {
          const startRange = barNoteRanges[box.startBar]
          const endRange = barNoteRanges[box.endBar]
          if (!startRange || !endRange) return
          const firstNote = notes[startRange.start]
          const lastNote = notes[endRange.end]
          if (!firstNote || !lastNote) return

          const x1 = noteheadCentreX(firstNote) - (NOTEHEAD_RX + BOX_MARGIN_X)
          const x2 = noteheadCentreX(lastNote) + (NOTEHEAD_RX + BOX_MARGIN_X)
          collectedBoxes.push({
            x: x1,
            y: boxTop,
            width: x2 - x1,
            height: boxBottom - boxTop,
            colour: colourForLetter(box.letter),
          })
        })
    })

    const lyricBlockHeight = maxLyricLines * LYRIC_LINE_HEIGHT
    // Enough room below the last system's box for its lyric block, with the
    // same top-and-bottom breathing room every other system's lyric gets.
    // VexFlow reserves blank space ABOVE a stave's top line (for ottava marks,
    // tempo text and the like), and that reserve scales with STAVE_LINE_SPACING
    // — at the current spacing it was ~100 units, a fifth of the whole canvas,
    // rendering as a large empty band between the xylophone and the music. The
    // bottom was already trimmed to real content; the top is trimmed the same
    // way here, so the box matches what is actually drawn in it.
    const contentTop = Math.max(0, Math.min(...boxTopBySystem) - CONTENT_PAD)
    const lastBoxBottom = boxBottomBySystem.at(-1) ?? 0
    const totalHeight = lastBoxBottom + lyricBlockHeight + LYRIC_TOP_GAP * 2
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
      staffSvg.setAttribute('viewBox', `0 ${contentTop} ${staveWidth + LEFT_PAD * 2} ${totalHeight - contentTop}`)
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
    setSize({ top: contentTop, width: staveWidth + LEFT_PAD * 2, height: totalHeight - contentTop })
  }, [song, keyName])

  const active = activeNoteIndex === null ? null : marks[activeNoteIndex] ?? null
  const viewBox = `0 ${size.top} ${size.width} ${size.height}`

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
              rx={SPACE * 0.5}
              fill={hexToRgba(box.colour, BOX_FILL_ALPHA)}
              stroke={box.colour}
              strokeWidth={SPACE * 0.08}
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
                fontSize={NOTEHEAD_FONT_SIZE}
                fontWeight="bold"
                fill={note.textColour}
              >
                {note.letter}
              </text>
            </g>
          ))}

          {lyricMarks.map((lyric, i) => (
            <text key={i} x={lyric.x} y={lyric.y} textAnchor="middle" fontSize={LYRIC_FONT_SIZE} fill="currentColor">
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
            x={active.x - CURSOR_HALF_WIDTH}
            y={active.top}
            width={CURSOR_HALF_WIDTH * 2}
            height={active.bottom - active.top}
            rx={SPACE * 0.35}
            fill="rgba(245, 158, 11, 0.30)"
            stroke="rgb(217, 119, 6)"
            strokeWidth={SPACE * 0.12}
          />
        </svg>
      )}
    </div>
  )
}
