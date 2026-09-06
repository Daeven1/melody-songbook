import * as Tone from 'tone'
import { createBellInstrument, type Instrument } from '../audio/instrument'

/**
 * What a struck bar sounds like on the bench. A seated bar rings with the same
 * bell voice the play-along uses, so the two screens agree; a bar that has been
 * lifted or rested in the box is off its nodes and only clacks.
 */
export interface BenchSounds {
  /** Call from a user gesture before the first strike so the audio context can start. */
  unlock(): Promise<void>
  strike(midi: number, seated: boolean): void
  dispose(): void
}

export function createBenchSounds(): BenchSounds {
  let bell: Instrument | null = null
  let clack: Tone.NoiseSynth | null = null

  return {
    async unlock() {
      await Tone.start()
    },
    strike(midi, seated) {
      const now = Tone.now()
      if (seated) {
        bell ??= createBellInstrument()
        bell.triggerNote([midi], 1.2, now)
        return
      }
      if (!clack) {
        clack = new Tone.NoiseSynth({
          noise: { type: 'brown' },
          envelope: { attack: 0.001, decay: 0.06, sustain: 0 },
        }).toDestination()
        clack.volume.value = -6
      }
      clack.triggerAttackRelease(0.06, now)
    },
    dispose() {
      bell?.dispose()
      clack?.dispose()
    },
  }
}
