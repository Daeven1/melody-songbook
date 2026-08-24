import { useEffect, useRef, useState } from 'react'
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
const NOTEHEAD_RADIUS = 12

export interface BordunStaffProps {
  bordun: Bordun
  keyName: KeyName
  /** Currently sounding pitches — already shifted down by BORDUN_PLAYBACK_SHIFT. */
  litPitches: number[]
  label: string
}

interface HeadMark {
  x: number
  y: number
  fill: string
  textColour: string
  letter: string
  lit: boolean
}

/**
 * The selected bordun pattern's single bar, drawn as real notation rather than
 * only lighting up the xylophone — so the accompaniment half of the class has
 * something to read, the same way the melody half reads the staff above.
 *
 * Every bordun pattern in the book is halves and quarters only, so unlike the
 * melody staff this never needs beaming.
 */
export function BordunStaff({ bordun, keyName, litPitches, label }: BordunStaffProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [heads, setHeads] = useState<HeadMark[]>([])
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    host.innerHTML = ''

    const events = bordun.keys[keyName]

    const staveNotes = events.map(event => {
      const isRest = event.pitches.length === 0
      const sorted = [...event.pitches].sort((a, b) => a - b)
      const keys = isRest ? [REST_KEY] : sorted.map(bordunVexKey)
      return {
        event,
        sortedPitches: sorted,
        staveNote: new StaveNote({ keys, duration: bordunVexDuration(event.duration, isRest) }),
      }
    })

    const probeVoice = new Voice({ numBeats: 4, beatValue: 4 })
    probeVoice.setStrict(false)
    probeVoice.addTickables(staveNotes.map(({ staveNote }) => staveNote))
    const probeStave = new Stave(LEFT_PAD, 0, MIN_STAVE_WIDTH)
    probeStave.addClef('treble').addTimeSignature('4/4')
    const noteStartOffset = probeStave.getNoteStartX() - probeStave.getX()
    const contentWidth = new Formatter().joinVoices([probeVoice]).preCalculateMinTotalWidth([probeVoice])
    const staveWidth = Math.max(
      MIN_STAVE_WIDTH,
      Math.min(MAX_STAVE_WIDTH, noteStartOffset + contentWidth * 1.6 + TRAILING_PAD),
    )
    const staveHeight = 110

    const renderer = new Renderer(host, Renderer.Backends.SVG)
    renderer.resize(staveWidth + LEFT_PAD * 2, staveHeight)
    const context = renderer.getContext()

    const stave = new Stave(LEFT_PAD, 6, staveWidth)
    stave.addClef('treble')
    stave.addTimeSignature('4/4')
    stave.setNoteStartX(stave.getX() + noteStartOffset)
    stave.setEndBarType(Barline.type.END)
    stave.setContext(context).draw()

    // Fresh StaveNote objects — the probe pass above already consumed the
    // originals' formatting state.
    const drawNotes = events.map(event => {
      const isRest = event.pitches.length === 0
      const sorted = [...event.pitches].sort((a, b) => a - b)
      const keys = isRest ? [REST_KEY] : sorted.map(bordunVexKey)
      const staveNote = new StaveNote({ keys, duration: bordunVexDuration(event.duration, isRest) })
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

    const litSounding = new Set(litPitches)
    const collected: HeadMark[] = []

    drawNotes.forEach(({ staveNote, sorted }) => {
      if (staveNote.isRest()) return
      const x = staveNote.getAbsoluteX()
      const ys = staveNote.getYs()
      sorted.forEach((writtenPitch, i) => {
        const rgb = colourForPitch(writtenPitch)
        const sounding = writtenPitch + BORDUN_PLAYBACK_SHIFT
        collected.push({
          x,
          y: ys[i] ?? 0,
          fill: rgbToCss(rgb),
          textColour: textColourForFill(rgb),
          letter: bordunVexKey(writtenPitch)[0]!.toUpperCase(),
          lit: litSounding.has(sounding),
        })
      })
    })

    setHeads(collected)

    const staffSvg = host.querySelector('svg')
    if (staffSvg) {
      staffSvg.setAttribute('viewBox', `0 0 ${staveWidth + LEFT_PAD * 2} ${staveHeight}`)
      staffSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
      staffSvg.removeAttribute('width')
      staffSvg.removeAttribute('height')
      staffSvg.style.width = '100%'
      staffSvg.style.height = '100%'
      staffSvg.style.display = 'block'
    }

    setSize({ width: staveWidth + LEFT_PAD * 2, height: staveHeight })
  }, [bordun, keyName, litPitches])

  const viewBox = `0 0 ${size.width} ${size.height}`

  return (
    <div
      className="relative h-full max-w-full mx-auto"
      style={size.width > 0 ? { aspectRatio: `${size.width} / ${size.height}` } : { width: '100%' }}
    >
      <div ref={hostRef} className="absolute inset-0" />
      {size.width > 0 && (
        <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true" aria-label={label}>
          {heads.map((h, i) => (
            <g key={i}>
              <circle
                cx={h.x} cy={h.y} r={NOTEHEAD_RADIUS} fill={h.fill}
                stroke={h.lit ? '#111' : 'none'} strokeWidth={h.lit ? 3 : 0}
              />
              <text x={h.x} y={h.y} textAnchor="middle" dominantBaseline="central"
                fontSize={11} fontWeight="bold" fill={h.textColour}>
                {h.letter}
              </text>
            </g>
          ))}
        </svg>
      )}
    </div>
  )
}
