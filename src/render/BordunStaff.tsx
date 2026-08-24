import { useEffect, useMemo, useRef, useState } from 'react'
import { Barline, Formatter, Renderer, Stave, StaveNote, Stem, Voice } from 'vexflow'
import type { Bordun, KeyName } from '../types'
import { BORDUN_PLAYBACK_SHIFT } from '../play/schedule'
import { colourForPitch, rgbToCss } from '../music/colours'
import { textColourForFill } from './noteheads'
import { bordunVexDuration, bordunVexKey } from './bordunVexNotes'
import { REST_KEY } from './vexNotes'

/**
 * VexFlow's default line spacing, and the unit every size below is expressed
 * in — the same convention as Notation.tsx. Drawing at natural scale keeps the
 * clef, time signature and stems correctly proportioned to the staff; the SVG
 * viewBox does the magnifying. See the SPACE comment in Notation.tsx.
 */
const SPACE = 10

const LEFT_PAD = SPACE * 0.6
const TRAILING_PAD = SPACE * 1
const MIN_STAVE_WIDTH = SPACE * 18
const MAX_STAVE_WIDTH = SPACE * 32
const NOTEHEAD_RX = SPACE * 0.73
const NOTEHEAD_RY = SPACE * 0.46
const NOTEHEAD_TILT_DEGREES = -20
const NOTEHEAD_FONT_SIZE = SPACE * 0.62
/** Every bordun pitch sits above the middle line, so stems point down. */
const STEM_SPACES = 3.5
/** Generous first-pass canvas; cropped to the real drawn bounds below. */
const DRAW_HEIGHT = SPACE * 40
/** Breathing room kept around the trimmed content edges. */
const CONTENT_PAD = SPACE * 0.3

export interface BordunStaffProps {
  bordun: Bordun
  keyName: KeyName
  /** Currently sounding pitches — already shifted down by BORDUN_PLAYBACK_SHIFT. */
  litPitches: number[]
  label: string
}

/** A drawn notehead's fixed geometry — everything that does NOT change while playing. */
interface HeadMark {
  x: number
  y: number
  fill: string
  textColour: string
  letter: string
  /** This notehead's written pitch, shifted to the sounding pitch it lights up for. */
  sounding: number
}

/**
 * The selected bordun pattern's single bar, drawn as real notation rather than
 * only lighting up the xylophone — so the accompaniment half of the class has
 * something to read, the same way the melody half reads the staff above.
 *
 * Every bordun pattern in the book is halves and quarters only, so unlike the
 * melody staff this never needs beaming.
 *
 * Drawing the staff (expensive: tears down and rebuilds an SVG via VexFlow) and
 * lighting the current beat (cheap: a Set lookup) are kept on separate clocks.
 * The effect below runs only when the pattern or key changes; `litPitches`
 * changes up to 60 times a second during playback and is compared directly in
 * the render body instead, the same way Xylophone computes its lit bars.
 */
export function BordunStaff({ bordun, keyName, litPitches, label }: BordunStaffProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [heads, setHeads] = useState<HeadMark[]>([])
  const [size, setSize] = useState({ top: 0, width: 0, height: 0 })

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    host.innerHTML = ''

    const events = bordun.keys[keyName]

    const buildStaveNote = (event: (typeof events)[number]) => {
      const isRest = event.pitches.length === 0
      const sorted = [...event.pitches].sort((a, b) => a - b)
      const keys = isRest ? [REST_KEY] : sorted.map(bordunVexKey)
      const staveNote = new StaveNote({ keys, duration: bordunVexDuration(event.duration, isRest) })
      // Every bordun pitch sits above the middle line, so correct engraving puts
      // the stem DOWN. VexFlow was choosing up, which is both wrong notation and
      // — because stem length scales with STAVE_LINE_SPACING — a tall band of
      // near-empty space above the staff.
      if (!isRest) staveNote.setStemDirection(Stem.DOWN)
      return { staveNote, sorted, isRest }
    }

    const probeVoice = new Voice({ numBeats: 4, beatValue: 4 })
    probeVoice.setStrict(false)
    probeVoice.addTickables(events.map(event => buildStaveNote(event).staveNote))
    const probeStave = new Stave(LEFT_PAD, 0, MIN_STAVE_WIDTH)
    probeStave.addClef('treble').addTimeSignature('4/4')
    const noteStartOffset = probeStave.getNoteStartX() - probeStave.getX()
    const contentWidth = new Formatter().joinVoices([probeVoice]).preCalculateMinTotalWidth([probeVoice])
    const staveWidth = Math.max(
      MIN_STAVE_WIDTH,
      Math.min(MAX_STAVE_WIDTH, noteStartOffset + contentWidth * 2.4 + TRAILING_PAD),
    )
    const renderer = new Renderer(host, Renderer.Backends.SVG)
    renderer.resize(staveWidth + LEFT_PAD * 2, DRAW_HEIGHT)
    const context = renderer.getContext()

    const stave = new Stave(LEFT_PAD, SPACE * 0.6, staveWidth)
    stave.addClef('treble')
    stave.addTimeSignature('4/4')
    stave.setNoteStartX(stave.getX() + noteStartOffset)
    stave.setEndBarType(Barline.type.END)
    stave.setContext(context).draw()

    // Fresh StaveNote objects — the probe pass above already consumed the
    // originals' formatting state.
    const drawNotes = events.map(event => {
      const { staveNote, sorted, isRest } = buildStaveNote(event)
      if (!isRest) {
        sorted.forEach((_, i) => staveNote.setKeyStyle(i, { fillStyle: 'transparent', strokeStyle: 'transparent' }))
      }
      return { staveNote, sorted }
    })

    const voice = new Voice({ numBeats: 4, beatValue: 4 })
    voice.setStrict(false)
    voice.addTickables(drawNotes.map(d => d.staveNote))
    new Formatter().joinVoices([voice]).format([voice], staveWidth - noteStartOffset - TRAILING_PAD)
    // Stem length after formatting, when each note knows where it sits — the
    // same reasoning as Notation.tsx: VexFlow's default stem does not scale
    // with anything, so set it explicitly in spaces.
    drawNotes.forEach(({ staveNote }) => {
      if (!staveNote.isRest()) staveNote.setStemLength(STEM_SPACES * SPACE)
    })

    voice.draw(context, stave)

    const collected: HeadMark[] = []
    drawNotes.forEach(({ staveNote, sorted }) => {
      if (staveNote.isRest()) return
      const x = staveNote.getAbsoluteX()
      const ys = staveNote.getYs()
      sorted.forEach((writtenPitch, i) => {
        const rgb = colourForPitch(writtenPitch)
        collected.push({
          x,
          y: ys[i] ?? 0,
          fill: rgbToCss(rgb),
          textColour: textColourForFill(rgb),
          letter: bordunVexKey(writtenPitch)[0]!.toUpperCase(),
          sounding: writtenPitch + BORDUN_PLAYBACK_SHIFT,
        })
      })
    })
    setHeads(collected)

    const staffSvg = host.querySelector('svg')
    // Crop to what was actually drawn. A fixed height here was both wasteful
    // (blank reserved space above the stave) and wrong (at this line spacing
    // the bottom stave line fell past a fixed 180, clipping it). getBBox is the
    // real answer: it reports exactly what VexFlow put on the canvas.
    let contentTop = 0
    let contentHeight = DRAW_HEIGHT
    if (staffSvg) {
      // VexFlow draws noteheads as glyphs from a music font, and each carries a
      // font em-box far taller than the glyph's ink (~161 units here). We style
      // them transparent and draw our own coloured ellipses over them, so they
      // contribute nothing visible — but getBBox still counts those em-boxes and
      // would size the canvas to invisible geometry. Remove them before measuring.
      staffSvg.querySelectorAll('.vf-notehead').forEach(el => el.remove())
      const drawn = (staffSvg as unknown as SVGGraphicsElement).getBBox()
      contentTop = Math.max(0, drawn.y - CONTENT_PAD)
      contentHeight = drawn.height + CONTENT_PAD * 2
      staffSvg.setAttribute('viewBox', `0 ${contentTop} ${staveWidth + LEFT_PAD * 2} ${contentHeight}`)
      staffSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
      staffSvg.removeAttribute('width')
      staffSvg.removeAttribute('height')
      staffSvg.style.width = '100%'
      staffSvg.style.height = '100%'
      staffSvg.style.display = 'block'
    }

    setSize({ top: contentTop, width: staveWidth + LEFT_PAD * 2, height: contentHeight })
    // litPitches deliberately excluded — see the effect's doc comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bordun, keyName])

  const litSounding = useMemo(() => new Set(litPitches), [litPitches])
  const viewBox = `0 ${size.top} ${size.width} ${size.height}`

  return (
    <div
      className="relative h-full max-w-full mx-auto"
      style={size.width > 0 ? { aspectRatio: `${size.width} / ${size.height}` } : { width: '100%' }}
    >
      <div ref={hostRef} className="absolute inset-0" />
      {size.width > 0 && (
        <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true" aria-label={label}>
          {heads.map((h, i) => {
            const lit = litSounding.has(h.sounding)
            return (
              <g key={i}>
                <ellipse
                  cx={h.x} cy={h.y} rx={NOTEHEAD_RX} ry={NOTEHEAD_RY} fill={h.fill}
                  transform={`rotate(${NOTEHEAD_TILT_DEGREES} ${h.x} ${h.y})`}
                  stroke={lit ? '#111' : 'none'} strokeWidth={lit ? SPACE * 0.12 : 0}
                />
                <text x={h.x} y={h.y} textAnchor="middle" dominantBaseline="central"
                  fontSize={NOTEHEAD_FONT_SIZE} fontWeight="bold" fill={h.textColour}>
                  {h.letter}
                </text>
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}
