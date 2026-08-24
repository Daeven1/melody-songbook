import type { TimedEvent } from './schedule'

/** The last event of `kind` that has started by `time` and has not yet finished. */
function activeEvent(events: TimedEvent[], time: number, kind: TimedEvent['kind']): TimedEvent | null {
  let found: TimedEvent | null = null
  for (const event of events) {
    if (event.kind !== kind) continue
    if (event.time > time) break                       // events are time-sorted
    if (time < event.time + event.durationSeconds) found = event
  }
  return found
}

export function activeMelodyIndexAt(events: TimedEvent[], time: number): number | null {
  return activeEvent(events, time, 'melody')?.noteIndex ?? null
}

export function activeBordunPitchesAt(events: TimedEvent[], time: number): number[] {
  return activeEvent(events, time, 'bordun')?.pitches ?? []
}

/** 1-based beat during the count-in, or null once the song proper has begun. */
export function countInBeatAt(events: TimedEvent[], time: number): number | null {
  const firstSounding = events.find(e => e.kind !== 'metronome')
  if (!firstSounding || time >= firstSounding.time) return null
  const click = activeEvent(events, time, 'metronome')
  return click ? click.beatInBar + 1 : null
}

export function scheduleEndSeconds(events: TimedEvent[]): number {
  return events
    .filter(e => e.kind !== 'metronome')
    .reduce((end, e) => Math.max(end, e.time + e.durationSeconds), 0)
}
