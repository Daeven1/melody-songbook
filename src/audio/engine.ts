import * as Tone from 'tone'
import type { TimedEvent } from '../play/schedule'
import { createBellInstrument, createMetronome, type Instrument } from './instrument'

/** Headroom between scheduling and the first sounding event. */
const SCHEDULING_LEAD_SECONDS = 0.1

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
  private wallAnchorMs = 0
  private playing = false

  async start(events: TimedEvent[], mutes: Mutes): Promise<void> {
    await Tone.start()
    // Safari and Chrome can leave the context suspended even after Tone.start();
    // resume explicitly so a silent context never also freezes the visuals.
    const context = Tone.getContext().rawContext as unknown as AudioContext
    if (context.state !== 'running') {
      try { await context.resume() } catch { /* audio stays silent; visuals still run */ }
    }
    this.stop()

    this.melody = createBellInstrument()
    this.metronome = createMetronome()

    const now = Tone.now() + SCHEDULING_LEAD_SECONDS   // headroom so the first event is never late
    for (const event of audibleEvents(events, mutes)) {
      const at = now + event.time
      if (event.kind === 'metronome') {
        this.metronome.triggerNote([event.beatInBar === 0 ? 1 : 0], event.durationSeconds, at)
      } else {
        this.melody.triggerNote(event.pitches, event.durationSeconds, at)
      }
    }

    this.startedAt = now
    this.wallAnchorMs = performance.now()
    this.playing = true
  }

  stop(): void {
    this.melody?.dispose()
    this.metronome?.dispose()
    this.melody = null
    this.metronome = null
    this.playing = false
  }

  /**
   * Seconds since playback began. Negative during the 0.1s scheduling lead-in.
   *
   * Anchored to the wall clock rather than read from Tone.now(). Audio is still
   * scheduled ahead on the audio clock — the rule that visuals are never driven
   * from a scheduled callback is intact — but a suspended or throttled audio
   * context must not be able to freeze the cursor, which is what happens when
   * the visual timeline reads Tone.now() directly.
   */
  get currentTime(): number {
    if (!this.playing) return 0
    return (performance.now() - this.wallAnchorMs) / 1000 - SCHEDULING_LEAD_SECONDS
  }

  get isPlaying(): boolean {
    return this.playing
  }

  dispose(): void {
    this.stop()
  }
}
