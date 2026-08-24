import { useEffect, useState } from 'react'
import type { PlaybackEngine } from '../audio/engine'

/**
 * Reads the audio clock once per animation frame.
 *
 * This direction matters. Tone schedules audio ahead of real time, so its
 * callbacks fire early — driving the cursor from them would run it ahead of the
 * sound. Instead the audio is scheduled once and the UI asks, every frame, what
 * time it is now.
 */
export function useTransportClock(engine: PlaybackEngine, isPlaying: boolean): number {
  const [time, setTime] = useState(0)

  useEffect(() => {
    if (!isPlaying) {
      setTime(0)
      return
    }
    let frame = 0
    const tick = () => {
      setTime(engine.currentTime)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [engine, isPlaying])

  return time
}
