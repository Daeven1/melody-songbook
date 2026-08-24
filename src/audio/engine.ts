import * as Tone from 'tone'
import type { TimedEvent } from '../play/schedule'
import { createBellInstrument, createMetronome, type Instrument } from './instrument'

export interface Mutes {
  melody: boolean
  bordun: boolean
  metronome: boolean
}

/** Drops muted parts. Pure — order and the input array are untouched. */
export function audibleEvents(events: TimedEvent[], mutes: Mutes): TimedEvent[] {
  return events.filter(event => !mutes[event.kind])
}

/**
 * Schedules a whole performance on the audio clock, then gets out of the way.
 *
 * Nothing visual is driven from here. Tone's callbacks fire ahead of real time
 * by design, so the UI reads `currentTime` on each animation frame instead —
 * see src/play/useTransportClock.ts.
 */
export class PlaybackEngine {
  private melody: Instrument | null = null
  private metronome: Instrument | null = null
  private startedAt = 0
  private playing = false

  async start(events: TimedEvent[], mutes: Mutes): Promise<void> {
    await Tone.start()
    this.stop()

    this.melody = createBellInstrument()
    this.metronome = createMetronome()

    const now = Tone.now() + 0.1   // a beat of headroom so the first event is never late
    for (const event of audibleEvents(events, mutes)) {
      const at = now + event.time
      if (event.kind === 'metronome') {
        this.metronome.triggerNote([event.beatInBar === 0 ? 1 : 0], event.durationSeconds, at)
      } else {
        this.melody.triggerNote(event.pitches, event.durationSeconds, at)
      }
    }

    this.startedAt = now
    this.playing = true
  }

  stop(): void {
    this.melody?.dispose()
    this.metronome?.dispose()
    this.melody = null
    this.metronome = null
    this.playing = false
  }

  /** Seconds since playback began, on the audio clock. Negative during the lead-in. */
  get currentTime(): number {
    return this.playing ? Tone.now() - this.startedAt : 0
  }

  get isPlaying(): boolean {
    return this.playing
  }

  dispose(): void {
    this.stop()
  }
}
