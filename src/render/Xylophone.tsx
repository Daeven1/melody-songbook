import type { KeyName } from '../types'
import { rgbToCss } from '../music/colours'
import { pitchClass } from '../music/pitch'
import { pentatonicPitchClasses, type XylophoneBar } from './xylophoneLayout'

const BAR_WIDTH = 46
const BAR_GAP = 6
const ROW_HEIGHT = 96
const CHROMATIC_HEIGHT = 62
const CHROMATIC_LIFT = 52

export interface XylophoneProps {
  bars: XylophoneBar[]
  /** Sounding pitches to light right now. */
  litPitches: number[]
  keyName: KeyName
  /** Which mallet struck, for the strike marker. */
  hand: 'L' | 'R' | 'both' | null
  label: string
}

export function Xylophone({ bars, litPitches, keyName, hand, label }: XylophoneProps) {
  const inKey = new Set(pentatonicPitchClasses(keyName))
  const lit = new Set(litPitches)
  const span = Math.max(...bars.map(b => b.position)) + 1
  const width = span * (BAR_WIDTH + BAR_GAP)

  return (
    <figure className="w-full">
      <figcaption className="sr-only">{label}</figcaption>
      <svg viewBox={`0 0 ${width} ${ROW_HEIGHT + CHROMATIC_LIFT}`} className="w-full" role="img" aria-label={label}>
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
              {isLit && (
                // The mallet strike lands in the centre of the bar.
                <circle cx={x + BAR_WIDTH / 2} cy={y + height / 2} r={16}
                        fill="none" stroke="#111" strokeWidth={4} opacity={0.85} />
              )}
            </g>
          )
        })}
      </svg>
      {hand && <p className="text-center text-sm opacity-70">{hand === 'both' ? 'both hands' : `${hand} hand`}</p>}
    </figure>
  )
}
