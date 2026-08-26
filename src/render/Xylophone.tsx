import type { KeyName } from '../types'
import { rgbToCss } from '../music/colours'
import { pitchClass } from '../music/pitch'
import { pentatonicPitchClasses, type XylophoneBar } from './xylophoneLayout'

const BAR_WIDTH = 46
const BAR_GAP = 6
// Every bar sits on one uniform row now — the F slot shows F or F# depending
// on the key (see xylophoneLayout.ts), so there is no separate raised bar to
// reserve space for above the row.
const ROW_HEIGHT = 150

// Mallet geometry. The head is the contact point; the shaft trails below it
// toward the player, whether the mallet is idle or mid-strike.
const MALLET_ZONE_HEIGHT = 58
const MALLET_REST_Y = ROW_HEIGHT + 20
const MALLET_SHAFT_LENGTH = 34
const MALLET_HEAD_RADIUS = 17
const TOTAL_HEIGHT = ROW_HEIGHT + MALLET_ZONE_HEIGHT

export interface XylophoneProps {
  bars: XylophoneBar[]
  /** Sounding pitches to light right now. */
  litPitches: number[]
  keyName: KeyName
  /**
   * The bar each mallet hovers over — the note it is playing, or the one it is
   * about to play. A mallet with nothing to play is hidden rather than parked
   * somewhere arbitrary.
   */
  mallets: { left: number | null; right: number | null }
  label: string
}

interface MalletTarget {
  x: number
  y: number
  struck: boolean
}

/** Where a struck bar's centre sits, for a mallet head to land on. */
function barCentre(bars: XylophoneBar[], midi: number): { x: number; y: number } | null {
  const bar = bars.find(b => b.midi === midi)
  if (!bar) return null
  const x = bar.position * (BAR_WIDTH + BAR_GAP) + BAR_WIDTH / 2
  return { x, y: ROW_HEIGHT / 2 }
}

/**
 * Places one mallet over its bar.
 *
 * A waiting mallet sits just below its bar rather than in a fixed parking
 * spot, so it tracks the music around the instrument; a striking one moves up
 * onto the bar's centre.
 */
function malletTarget(bars: XylophoneBar[], pitch: number | null, litPitches: number[]): MalletTarget | null {
  if (pitch === null) return null
  const centre = barCentre(bars, pitch)
  if (!centre) return null
  const struck = litPitches.includes(pitch)
  return { x: centre.x, y: struck ? centre.y : MALLET_REST_Y, struck }
}

function Mallet({ target, side }: { target: MalletTarget; side: 'left' | 'right' }) {
  const headFill = side === 'left' ? '#1f7a8c' : '#b5384f'
  return (
    <g
      transform={`translate(${target.x}, ${target.y})`}
      style={{ transition: 'transform 120ms ease-out' }}
    >
      <line
        x1={0} y1={0} x2={0} y2={MALLET_SHAFT_LENGTH}
        stroke="#5a4632" strokeWidth={8} strokeLinecap="round"
      />
      <circle
        cx={0} cy={0} r={MALLET_HEAD_RADIUS}
        fill={headFill} stroke="#111" strokeWidth={target.struck ? 3 : 1.5}
        opacity={target.struck ? 1 : 0.75}
      />
      <text
        x={0} y={1} textAnchor="middle" dominantBaseline="central"
        fontSize={18} fontWeight={700} fill="#fff" pointerEvents="none"
      >
        {side === 'left' ? 'L' : 'R'}
      </text>
    </g>
  )
}

export function Xylophone({ bars, litPitches, keyName, mallets, label }: XylophoneProps) {
  const inKey = new Set(pentatonicPitchClasses(keyName))
  const lit = new Set(litPitches)
  const span = Math.max(...bars.map(b => b.position)) + 1
  const width = span * (BAR_WIDTH + BAR_GAP)
  const malletTargets = {
    left: malletTarget(bars, mallets.left, litPitches),
    right: malletTarget(bars, mallets.right, litPitches),
  }

  return (
    <figure className="h-full w-full">
      <figcaption className="sr-only">{label}</figcaption>
      <svg
        viewBox={`0 0 ${width} ${TOTAL_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        className="block mx-auto h-full w-full"
        role="img"
        aria-label={label}
      >
        {bars.map(bar => {
          const isLit = lit.has(bar.midi)
          const dimmed = !inKey.has(pitchClass(bar.midi))
          const x = bar.position * (BAR_WIDTH + BAR_GAP)

          return (
            <g key={bar.midi} opacity={dimmed && !isLit ? 0.22 : 1}>
              <rect
                x={x} y={0} width={BAR_WIDTH} height={ROW_HEIGHT} rx={6}
                fill={rgbToCss(bar.colour)}
                stroke={isLit ? '#111' : 'rgba(0,0,0,0.25)'}
                strokeWidth={isLit ? 4 : 1.5}
              />
              <text
                x={x + BAR_WIDTH / 2} y={ROW_HEIGHT / 2} textAnchor="middle" dominantBaseline="central"
                fontSize={24} fontWeight={700} fill="#1a1a1a" pointerEvents="none"
              >
                {bar.letter}
              </text>
            </g>
          )
        })}
        {malletTargets.left && <Mallet target={malletTargets.left} side="left" />}
        {malletTargets.right && <Mallet target={malletTargets.right} side="right" />}
      </svg>
    </figure>
  )
}
