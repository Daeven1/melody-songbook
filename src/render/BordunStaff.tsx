import { useEffect, useMemo, useRef, useState } from 'react'
import { Barline, Formatter, Renderer, Stave, StaveNote, Voice } from 'vexflow'
import type { Bordun, KeyName } from '../types'
import { BORDUN_PLAYBACK_SHIFT } from '../play/schedule'
import { colourForPitch, rgbToCss } from '../music/colours'
import { textColourForFill } from './noteheads'
import { bordunVexDuration, bordunVexKey } from './bordunVexNotes'
import { REST_KEY } from './vexNotes'

const LEFT_PAD = 16
const TRAILING_PAD = 20
const MIN_STAVE_WIDTH = 260
const MAX_STAVE_WIDTH = 520
// Matches Notation.tsx's staff scale, so the melody and bordun staves read as
// one consistent system rather than two different sizes of notation.
const STAVE_LINE_SPACING = 26
const STAVE_OPTIONS = { spacingBetweenLinesPx: STAVE_LINE_SPACING }
const NOTEHEAD_RX = 19
const NOTEHEAD_RY = 12
const NOTEHEAD_TILT_DEGREES = -20
/** Generous first-pass canvas; cropped to the real drawn bounds below. */
const DRAW_HEIGHT = 400
/** Breathing room kept around the trimmed content edges. */
const CONTENT_PAD = 8

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
      return { staveNote: new StaveNote({ keys, duration: bordunVexDuration(event.duration, isRest) }), sorted, isRest }
    }

    const probeVoice = new Voice({ numBeats: 4, beatValue: 4 })
    probeVoice.setStrict(false)
    probeVoice.addTickables(events.map(event => buildStaveNote(event).staveNote))
    const probeStave = new Stave(LEFT_PAD, 0, MIN_STAVE_WIDTH, STAVE_OPTIONS)
    probeStave.addClef('treble').addTimeSignature('4/4')
    const noteStartOffset = probeStave.getNoteStartX() - probeStave.getX()
    const contentWidth = new Formatter().joinVoices([probeVoice]).preCalculateMinTotalWidth([probeVoice])
    const staveWidth = Math.max(
      MIN_STAVE_WIDTH,
      Math.min(MAX_STAVE_WIDTH, noteStartOffset + contentWidth * 1.6 + TRAILING_PAD),
    )
    const renderer = new Renderer(host, Renderer.Backends.SVG)
    renderer.resize(staveWidth + LEFT_PAD * 2, DRAW_HEIGHT)
    const context = renderer.getContext()

    const stave = new Stave(LEFT_PAD, 6, staveWidth, STAVE_OPTIONS)
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
                  stroke={lit ? '#111' : 'none'} strokeWidth={lit ? 3 : 0}
                />
                <text x={h.x} y={h.y} textAnchor="middle" dominantBaseline="central"
                  fontSize={15} fontWeight="bold" fill={h.textColour}>
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
