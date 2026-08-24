import type { KeyName } from '../types'
import { rgbToCss } from '../music/colours'
import { pitchClass } from '../music/pitch'
import { pentatonicPitchClasses, type XylophoneBar } from './xylophoneLayout'

const BAR_WIDTH = 46
const BAR_GAP = 6
const ROW_HEIGHT = 108
const CHROMATIC_HEIGHT = 56
const CHROMATIC_LIFT = 44
const INSTRUMENT_HEIGHT = ROW_HEIGHT + CHROMATIC_LIFT

// Mallet geometry. The head is the contact point; the shaft trails below it
// toward the player, whether the mallet is idle or mid-strike.
const MALLET_ZONE_HEIGHT = 46
const MALLET_REST_Y = INSTRUMENT_HEIGHT + 14
const MALLET_SHAFT_LENGTH = 24
const MALLET_HEAD_RADIUS = 10
const TOTAL_HEIGHT = INSTRUMENT_HEIGHT + MALLET_ZONE_HEIGHT

export interface XylophoneProps {
  bars: XylophoneBar[]
  /** Sounding pitches to light right now. */
  litPitches: number[]
  keyName: KeyName
  /** Which mallet struck, for the strike marker. */
  hand: 'L' | 'R' | 'both' | null
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
  const y = (bar.isChromatic ? 0 : CHROMATIC_LIFT) + (bar.isChromatic ? CHROMATIC_HEIGHT : ROW_HEIGHT) / 2
  return { x, y }
}

/**
 * Assigns the sounding pitches to a left and right mallet target.
 * `'both'` splits a chord low-to-high across the two hands (mirroring how the
 * bars are laid out left-to-right); a single hand strikes and the other rests.
 */
function malletTargets(bars: XylophoneBar[], litPitches: number[], hand: 'L' | 'R' | 'both' | null, restX: { left: number; right: number }): { left: MalletTarget; right: MalletTarget } {
  const idleLeft: MalletTarget = { x: restX.left, y: MALLET_REST_Y, struck: false }
  const idleRight: MalletTarget = { x: restX.right, y: MALLET_REST_Y, struck: false }

  if (!hand || litPitches.length === 0) return { left: idleLeft, right: idleRight }

  const strike = (midi: number): MalletTarget => {
    const centre = barCentre(bars, midi)
    return centre ? { x: centre.x, y: centre.y, struck: true } : idleLeft
  }

  if (hand === 'both') {
    const sorted = litPitches.slice().sort((a, b) => a - b)
    const lowest = sorted[0]
    const highest = sorted[sorted.length - 1]
    if (lowest === undefined || highest === undefined) return { left: idleLeft, right: idleRight }
    return { left: strike(lowest), right: strike(highest) }
  }

  const pitch = litPitches[0]
  if (pitch === undefined) return { left: idleLeft, right: idleRight }
  return hand === 'L' ? { left: strike(pitch), right: idleRight } : { left: idleLeft, right: strike(pitch) }
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
        stroke="#5a4632" strokeWidth={5} strokeLinecap="round"
      />
      <circle
        cx={0} cy={0} r={MALLET_HEAD_RADIUS}
        fill={headFill} stroke="#111" strokeWidth={target.struck ? 3 : 1.5}
        opacity={target.struck ? 1 : 0.75}
      />
      <text
        x={0} y={1} textAnchor="middle" dominantBaseline="central"
        fontSize={11} fontWeight={700} fill="#fff" pointerEvents="none"
      >
        {side === 'left' ? 'L' : 'R'}
      </text>
    </g>
  )
}

export function Xylophone({ bars, litPitches, keyName, hand, label }: XylophoneProps) {
  const inKey = new Set(pentatonicPitchClasses(keyName))
  const lit = new Set(litPitches)
  const span = Math.max(...bars.map(b => b.position)) + 1
  const width = span * (BAR_WIDTH + BAR_GAP)
  const restX = { left: width * 0.3, right: width * 0.7 }
  const mallets = malletTargets(bars, litPitches, hand, restX)

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
          const y = bar.isChromatic ? 0 : CHROMATIC_LIFT
          const height = bar.isChromatic ? CHROMATIC_HEIGHT : ROW_HEIGHT

          return (
            <g key={bar.midi} opacity={dimmed && !isLit ? 0.22 : 1}>
              <rect
                x={x} y={y} width={BAR_WIDTH} height={height} rx={6}
                fill={rgbToCss(bar.colour)}
                stroke={isLit ? '#111' : 'rgba(0,0,0,0.25)'}
                strokeWidth={isLit ? 4 : 1.5}
              />
              <text
                x={x + BAR_WIDTH / 2} y={y + height / 2} textAnchor="middle" dominantBaseline="central"
                fontSize={20} fontWeight={700} fill="#1a1a1a" pointerEvents="none"
              >
                {bar.letter}{bar.isChromatic ? '♯' : ''}
              </text>
            </g>
          )
        })}
        <Mallet target={mallets.left} side="left" />
        <Mallet target={mallets.right} side="right" />
      </svg>
      {hand && <p className="text-center text-sm opacity-70">{hand === 'both' ? 'both hands' : `${hand} hand`}</p>}
    </figure>
  )
}
