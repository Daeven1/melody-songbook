import * as Tone from 'tone'

export interface Instrument {
  triggerNote(pitches: number[], durationSeconds: number, atTime: number): void
  dispose(): void
}

function midiToFrequency(midi: number): number {
  return Tone.Frequency(midi, 'midi').toFrequency()
}

/**
 * A struck-bar voice for both xylophones.
 *
 * Synthesized rather than sampled on purpose: no assets to ship, no licence to
 * clear, and it works offline from the first load. Everything that matters for
 * this app is timing and visual sync. To move to real glockenspiel samples,
 * replace this factory with a Tone.Sampler behind the same interface — no
 * caller changes.
 */
export function createBellInstrument(): Instrument {
  const synth = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 3.2,          // inharmonic partials read as "struck metal"
    modulationIndex: 14,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 1.6, sustain: 0, release: 1.2 },
    modulation: { type: 'square' },
    modulationEnvelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.4 },
  }).toDestination()
  synth.volume.value = -8

  return {
    triggerNote(pitches, durationSeconds, atTime) {
      if (pitches.length === 0) return
      synth.triggerAttackRelease(pitches.map(midiToFrequency), durationSeconds, atTime)
    },
    dispose() {
      synth.dispose()
    },
  }
}

/** Woodblock-ish click. Beat 1 is accented by pitching it up a fifth. */
export function createMetronome(): Instrument {
  const synth = new Tone.MembraneSynth({
    pitchDecay: 0.008,
    octaves: 2,
    envelope: { attack: 0.001, decay: 0.12, sustain: 0 },
  }).toDestination()
  synth.volume.value = -14

  return {
    triggerNote(pitches, _durationSeconds, atTime) {
      // pitches is [accentFlag]: 1 for beat one, 0 otherwise.
      const accented = pitches[0] === 1
      synth.triggerAttackRelease(accented ? 'C5' : 'G4', 0.05, atTime)
    },
    dispose() {
      synth.dispose()
    },
  }
}
