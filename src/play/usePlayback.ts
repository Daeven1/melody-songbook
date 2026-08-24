import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Bordun, KeyName, Song } from '../types'
import { PlaybackEngine, type Mutes } from '../audio/engine'
import { buildSchedule } from './schedule'
import { activeBordunPitchesAt, activeMelodyIndexAt, countInBeatAt, scheduleEndSeconds } from './selectors'
import { useTransportClock } from './useTransportClock'

export interface PlaybackOptions {
  song: Song
  key: KeyName
  bordun: Bordun
  bpm: number
  repeats: number
  mutes: Mutes
}

export interface PlaybackState {
  isPlaying: boolean
  time: number
  melodyIndex: number | null
  bordunPitches: number[]
  countInBeat: number | null
  play(): void
  stop(): void
}

export function usePlayback(options: PlaybackOptions): PlaybackState {
  const { song, key, bordun, bpm, repeats, mutes } = options
  const engineRef = useRef<PlaybackEngine | null>(null)
  if (engineRef.current === null) engineRef.current = new PlaybackEngine()
  const engine = engineRef.current

  const [isPlaying, setIsPlaying] = useState(false)
  const time = useTransportClock(engine, isPlaying)

  const events = useMemo(
    () => buildSchedule({ song, key, bordun, bpm, repeats }),
    [song, key, bordun, bpm, repeats],
  )

  const stop = useCallback(() => {
    engine.stop()
    setIsPlaying(false)
  }, [engine])

  const play = useCallback(() => {
    void engine.start(events, mutes).then(() => setIsPlaying(true))
  }, [engine, events, mutes])

  // Stop when the performance runs out, so the cursor does not hang on the last note.
  const endsAt = useMemo(() => scheduleEndSeconds(events), [events])
  useEffect(() => {
    if (isPlaying && time > endsAt) stop()
  }, [isPlaying, time, endsAt, stop])

  useEffect(() => () => engine.dispose(), [engine])

  return {
    isPlaying,
    time,
    melodyIndex: isPlaying ? activeMelodyIndexAt(events, time) : null,
    bordunPitches: isPlaying ? activeBordunPitchesAt(events, time) : [],
    countInBeat: isPlaying ? countInBeatAt(events, time) : null,
    play,
    stop,
  }
}
