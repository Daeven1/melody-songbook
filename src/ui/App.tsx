import { useCallback, useEffect, useMemo, useState } from 'react'
import songsJson from '../data/songs.json'
import bordunsJson from '../data/borduns.json'
import type { Bordun, BordunId, KeyName, Song } from '../types'
import { KEY_NAMES } from '../types'
import { usePlayback } from '../play/usePlayback'
import { flattenNotes } from '../play/schedule'
import { Notation } from '../render/Notation'
import { Xylophone } from '../render/Xylophone'
import { BordunStaff } from '../render/BordunStaff'
import { BORDUN_SOUNDING_RANGE, MELODY_RANGE, barsForRange } from '../render/xylophoneLayout'

const SONGS = (songsJson as unknown as Song[]).slice().sort((a, b) =>
  a.level - b.level || a.title.localeCompare(b.title),
)
const BORDUNS = bordunsJson as unknown as Bordun[]
const MELODY_BARS = barsForRange(...MELODY_RANGE)
const BORDUN_BARS = barsForRange(...BORDUN_SOUNDING_RANGE)

const REPEAT_CHOICES = [1, 2, 4, 8] as const
const MIN_BPM = 40
const MAX_BPM = 180

export function App() {
  const [songId, setSongId] = useState(SONGS[0]!.id)
  const [key, setKey] = useState<KeyName>('C')
  const [bordunId, setBordunId] = useState<BordunId>(BORDUNS[0]!.id)
  const [repeats, setRepeats] = useState<number>(1)
  const [mutes, setMutes] = useState({ melody: false, bordun: false, metronome: false })

  const song = SONGS.find(s => s.id === songId)!
  const bordun = BORDUNS.find(b => b.id === bordunId)!
  const [bpm, setBpm] = useState(song.defaultTempo)

  const notes = useMemo(() => flattenNotes(song, key), [song, key])

  const playback = usePlayback({ song, key, bordun, bpm, repeats, mutes })
  const { isPlaying, melodyIndex, bordunPitches, countInBeat, play, stop } = playback

  const toggle = useCallback(() => (isPlaying ? stop() : play()), [isPlaying, play, stop])

  // Driveable from across the room: space plays and stops, arrows nudge the tempo.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return
      if (event.code === 'Space') { event.preventDefault(); toggle() }
      if (event.code === 'ArrowUp') { event.preventDefault(); setBpm(b => Math.min(MAX_BPM, b + 5)) }
      if (event.code === 'ArrowDown') { event.preventDefault(); setBpm(b => Math.max(MIN_BPM, b - 5)) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  const litMelodyPitch = melodyIndex === null ? null : notes[melodyIndex]?.pitch ?? null
  const melodyHand = melodyIndex === null ? null : melodyIndex % 2 === 0 ? 'L' : 'R'
  const bordunHand = bordunPitches.length > 1 ? 'both' : bordunPitches.length === 1 ? 'R' : null

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-white text-neutral-900">
      <header className="shrink-0 px-6 pt-1.5 pb-0 flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-bold leading-tight">{song.title}</h1>
          <p className="text-lg font-normal opacity-60 leading-tight">
            Level {song.level} · key of {key} · {song.keys[key].label}
          </p>
        </div>
        <span className="text-2xl font-semibold tabular-nums opacity-70">{bpm} bpm</span>
      </header>

      {/* Melody instrument — what the melody half of the class plays */}
      <section className="shrink-0 h-[18vh] px-6">
        <Xylophone
          bars={MELODY_BARS}
          litPitches={litMelodyPitch === null ? [] : [litMelodyPitch]}
          keyName={key}
          hand={melodyHand}
          label="Melody xylophone"
        />
      </section>

      {/* Notation, with the cursor */}
      <main className="relative flex-1 min-h-0 px-6 py-0 flex items-stretch justify-center overflow-hidden">
        <Notation song={song} keyName={key} activeNoteIndex={melodyIndex} />
        {countInBeat !== null && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[10rem] font-black text-amber-500/80 tabular-nums">{countInBeat}</span>
          </div>
        )}
      </main>

      {/* Bordun notation — what the accompaniment half reads, same as the melody
          half reads the staff above. Sounding pitches come pre-shifted by
          BORDUN_PLAYBACK_SHIFT; BordunStaff compares against those directly. */}
      <section className="shrink-0 h-[12vh] px-6 flex items-center justify-center">
        <BordunStaff bordun={bordun} keyName={key} litPitches={bordunPitches} label={`${bordun.label} — notation`} />
      </section>

      {/* Bordun instrument — what the accompaniment half plays */}
      <section className="shrink-0 h-[14vh] px-6">
        <Xylophone
          bars={BORDUN_BARS}
          litPitches={bordunPitches}
          keyName={key}
          hand={bordunHand}
          label="Bordun xylophone"
        />
      </section>

      <footer className="shrink-0 border-t bg-neutral-50 px-6 py-1.5 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-sm">
        <button
          onClick={toggle}
          className={`px-8 py-3 rounded-lg text-xl font-bold text-white ${isPlaying ? 'bg-red-600' : 'bg-green-600'}`}
        >
          {isPlaying ? 'Stop' : 'Play'}
        </button>

        <label className="flex items-center gap-2">
          <span className="font-semibold">Song</span>
          <select
            value={songId}
            onChange={e => { const s = SONGS.find(x => x.id === e.target.value)!; setSongId(s.id); setBpm(s.defaultTempo); stop() }}
            className="border rounded px-2 py-1 max-w-xs"
          >
            {SONGS.map(s => <option key={s.id} value={s.id}>L{s.level} · {s.title}</option>)}
          </select>
        </label>

        <div className="flex items-center gap-2">
          <span className="font-semibold">Key</span>
          {KEY_NAMES.map(k => (
            <button
              key={k}
              onClick={() => { setKey(k); stop() }}
              className={`px-3 py-1 rounded border ${k === key ? 'bg-neutral-900 text-white' : 'bg-white'}`}
            >
              {k}<span className="ml-1 opacity-60 text-xs">{song.keys[k].label}</span>
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2">
          <span className="font-semibold">Bordun</span>
          <select
            value={bordunId}
            onChange={e => { setBordunId(e.target.value as BordunId); stop() }}
            className="border rounded px-2 py-1"
          >
            {BORDUNS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </label>

        <label className="flex items-center gap-2">
          <span className="font-semibold">Tempo</span>
          <input
            type="range" min={MIN_BPM} max={MAX_BPM} value={bpm}
            onChange={e => setBpm(Number(e.target.value))}
            className="w-40"
          />
          <span className="tabular-nums w-10">{bpm}</span>
        </label>

        <div className="flex items-center gap-2">
          <span className="font-semibold">Repeats</span>
          {REPEAT_CHOICES.map(n => (
            <button
              key={n}
              onClick={() => setRepeats(n)}
              className={`px-2 py-1 rounded border ${n === repeats ? 'bg-neutral-900 text-white' : 'bg-white'}`}
            >
              {n}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <span className="font-semibold">Sound</span>
          {(['melody', 'bordun', 'metronome'] as const).map(part => (
            <label key={part} className="flex items-center gap-1 capitalize">
              <input
                type="checkbox"
                checked={!mutes[part]}
                onChange={e => setMutes(m => ({ ...m, [part]: !e.target.checked }))}
              />
              {part}
            </label>
          ))}
        </div>

        <button
          onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())}
          className="ml-auto px-3 py-1 rounded border"
        >
          Fullscreen
        </button>

        <span className="w-full text-xs opacity-50">
          Space plays and stops · ↑ ↓ change the tempo
        </span>
      </footer>
    </div>
  )
}
