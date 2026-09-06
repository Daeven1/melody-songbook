import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyName } from '../types'
import { KEY_NAMES } from '../types'
import { rgbToCss } from '../music/colours'
import { goTo } from '../ui/route'
import { createBenchScene, type BenchScene, type ViewName } from './scene'
import { createBenchSounds } from './sounds'
import {
  benchBars, selectOnly, toggleSelection, summarizeSelection, type BarState, type BenchBar,
} from './model'

const STATE_TEXT: Record<BarState, string> = {
  seated: 'Seated on the cords, peg through its hole',
  lifted: 'Lifted straight up, clear of the pegs',
  tilted: 'Tilted in the air, ready to lower in',
  rested: 'Near end in the corner of the box, far end leaning on the far wall',
  aside: 'Set aside on the table',
}
const STATE_BUTTONS: { state: BarState; label: string }[] = [
  { state: 'seated', label: 'Seat' },
  { state: 'lifted', label: 'Lift' },
  { state: 'rested', label: 'Rest in box' },
  { state: 'aside', label: 'Set aside' },
]
const VIEW_BUTTONS: { view: ViewName; label: string }[] = [
  { view: 'three', label: 'Three-quarter' },
  { view: 'top', label: 'Top' },
  { view: 'player', label: 'Player' },
  { view: 'end', label: 'End' },
]

const btn = (on = false) =>
  `px-3 py-1.5 rounded border text-sm ${on ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white hover:bg-neutral-100'}`

/**
 * The bar bench: a 3D alto xylophone for teaching how bars come off and go
 * back on. Lift a bar straight up so its hole clears the peg, tilt it, and rest
 * it inside the box; swap F for F♯ by changing the key; pick up the mallets and
 * play. The scene lives in scene.ts; this component is the panel beside it.
 */
export function Bench() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<BenchScene | null>(null)
  const sounds = useMemo(createBenchSounds, [])

  const [key, setKey] = useState<KeyName>('C')
  const bars: BenchBar[] = useMemo(() => benchBars(key), [key])
  const [states, setStates] = useState<BarState[]>(() => bars.map(() => 'seated'))
  const [selected, setSelected] = useState<ReadonlySet<number>>(() => new Set())
  const [last, setLast] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [view, setView] = useState<ViewName>('three')
  const [spin, setSpin] = useState(false)
  const [boxOnly, setBoxOnly] = useState(false)
  const [exportNote, setExportNote] = useState<string | null>(null)

  // Keep the latest React state reachable from the scene's callbacks without rebuilding the scene.
  const playingRef = useRef(playing)
  playingRef.current = playing

  const select = useCallback((index: number | null, additive: boolean) => {
    setSelected(s => (index === null ? new Set() : additive ? toggleSelection(s, index) : selectOnly(s, index)))
    if (index !== null) setLast(index)
  }, [])
  const togglePlaying = useCallback(() => setPlaying(p => !p), [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const scene = createBenchScene(canvas, key, {
      onSelect: select,
      onMalletClick: togglePlaying,
      onStrike: (bar, seated) => sounds.strike(bar.midi, seated),
      onStatesChange: setStates,
    })
    sceneRef.current = scene
    return () => { scene.dispose(); sceneRef.current = null }
    // The scene is built once; key changes go through setKey below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { sceneRef.current?.setSelected(selected) }, [selected])
  useEffect(() => { sceneRef.current?.setPlaying(playing) }, [playing])
  useEffect(() => { sceneRef.current?.setSpin(spin) }, [spin])
  useEffect(() => { sceneRef.current?.setBoxOnly(boxOnly) }, [boxOnly])
  useEffect(() => () => sounds.dispose(), [sounds])

  const changeKey = (k: KeyName) => {
    setKey(k)
    setSelected(new Set())
    sceneRef.current?.setKey(k)     // rebuilds the bars, all seated
  }
  const chooseView = (v: ViewName) => { setView(v); setSpin(false); sceneRef.current?.setView(v) }

  const picked = useMemo(() => summarizeSelection(selected, states), [selected, states])
  const forSelected = useCallback((fn: (i: number) => void) => picked.ids.forEach(fn), [picked])
  const setState = useCallback((i: number, s: BarState) => sceneRef.current?.setBarState(i, s), [])
  const demonstrate = useCallback((i: number) => sceneRef.current?.demonstrate(i), [])

  // Keyboard, the same as the artifact: arrows walk the bars, letters pose the selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return
      const k = e.key.toLowerCase(), n = bars.length
      if (e.key === 'ArrowLeft') select(last < 0 ? 0 : (last + n - 1) % n, false)
      else if (e.key === 'ArrowRight') select(last < 0 ? 0 : (last + 1) % n, false)
      else if (e.key === 'Escape') select(null, false)
      else if (k === 's') forSelected(i => setState(i, 'seated'))
      else if (k === 'l') forSelected(i => setState(i, 'lifted'))
      else if (k === 'r') forSelected(i => setState(i, 'rested'))
      else if (k === 'a') forSelected(i => setState(i, 'aside'))
      else if (k === 'd') forSelected(demonstrate)
      else if (k === 'm') togglePlaying()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [bars.length, last, select, forSelected, setState, demonstrate, togglePlaying])

  const exportPNG = async () => {
    const scene = sceneRef.current
    if (!scene) return
    try {
      const blob = await scene.exportPNG()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `xylophone-${view}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 5000)
      setExportNote('Downloaded.')
    } catch {
      setExportNote('Export failed.')
    }
    setTimeout(() => setExportNote(null), 4000)
  }

  const one = picked.ids.length === 1 ? bars[picked.ids[0]!] : null

  return (
    <div className="h-dvh overflow-hidden flex bg-white text-neutral-900">
      <aside className="w-80 shrink-0 border-r bg-neutral-50 overflow-y-auto p-4 flex flex-col gap-4 text-sm">
        <div>
          <button onClick={() => goTo('play')} className="text-xs opacity-60 hover:opacity-100">← Back to the songbook</button>
          <h1 className="text-2xl font-bold leading-tight mt-1">Bar bench</h1>
          <p className="opacity-60 leading-snug mt-1">
            Drag to turn, scroll to zoom. Click a bar to pick it, ⌘-click to pick several. Click a mallet to play.
          </p>
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="text-[11px] font-semibold tracking-wider uppercase opacity-60">Key</h2>
          <div className="flex gap-1.5">
            {KEY_NAMES.map(k => (
              <button key={k} onClick={() => changeKey(k)} className={`${btn(k === key)} flex-1`}>{k}</button>
            ))}
          </div>
          <p className="text-xs opacity-60">D and G swap the F bars for F♯, as the students do.</p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-[11px] font-semibold tracking-wider uppercase opacity-60">Bars</h2>
          <div className="grid grid-cols-13 gap-0.5">
            {bars.map(bar => (
              <button
                key={bar.midi}
                title={`${bar.name} (⌘-click to add)`}
                onClick={e => select(bar.index, e.metaKey || e.ctrlKey)}
                className={`py-1 rounded-sm text-xs font-mono font-semibold border-b-4 ${selected.has(bar.index) ? 'bg-neutral-900 text-white' : 'bg-white'} ${states[bar.index] !== 'seated' ? 'opacity-40' : ''}`}
                style={{ borderBottomColor: rgbToCss(bar.colour) }}
              >
                {bar.letter}
              </button>
            ))}
          </div>
          <button onClick={() => select(null, false)} className={btn()}>Select none</button>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-[11px] font-semibold tracking-wider uppercase opacity-60">
            {picked.ids.length === 1 ? 'Selected bar' : 'Selected bars'}
          </h2>
          <div className="rounded border bg-white px-3 py-2 flex items-center gap-3">
            <div className="w-10 h-10 rounded grid place-items-center font-mono text-xl text-white bg-[#9e5348] relative">
              {one ? one.letter : picked.ids.length || '–'}
              {one && <i className="absolute top-1 right-1 w-2 h-2 rounded-full" style={{ background: rgbToCss(one.colour) }} />}
            </div>
            <div className="flex flex-col leading-snug">
              <span className="font-semibold">
                {picked.ids.length === 0 ? 'No bar selected'
                  : one ? `${one.name} · bar ${one.index + 1} of ${bars.length} · ${one.length.toFixed(0)} cm`
                  : `${picked.ids.length} bars selected · ${picked.ids.map(i => bars[i]!.letter).join(' ')}`}
              </span>
              <span className="text-xs opacity-60">
                {picked.ids.length === 0 ? 'Click a bar to pick it, ⌘-click to pick several'
                  : picked.commonState ? STATE_TEXT[picked.commonState] : 'In different positions'}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STATE_BUTTONS.map(({ state, label }) => (
              <button
                key={state}
                onClick={() => forSelected(i => setState(i, state))}
                disabled={picked.ids.length === 0}
                className={`${btn(picked.ids.length > 0 && picked.commonState === state)} flex-1 disabled:opacity-40`}
              >
                {label}
              </button>
            ))}
          </div>
          <button onClick={() => forSelected(demonstrate)} disabled={picked.ids.length === 0} className={`${btn()} disabled:opacity-40 border-neutral-400`}>
            Show the move: lift, tilt, lower in
          </button>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-[11px] font-semibold tracking-wider uppercase opacity-60">Mallets</h2>
          <button onClick={togglePlaying} onPointerDown={() => { void sounds.unlock() }} className={btn(playing)}>
            {playing ? 'Put the mallets down' : 'Pick up the mallets'}
          </button>
          <p className="text-xs opacity-60">
            {playing ? 'Click any bar to strike it. A bar that is not seated only clacks.'
              : 'They stand in the holes of the low-end plate. Pick them up, then click a bar to play it.'}
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-[11px] font-semibold tracking-wider uppercase opacity-60">All bars</h2>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => bars.forEach(b => setState(b.index, 'seated'))} className={`${btn()} flex-1`}>Seat all</button>
            <button onClick={() => bars.forEach(b => setState(b.index, 'rested'))} className={`${btn()} flex-1`}>Rest all in box</button>
            <button onClick={() => bars.forEach(b => setState(b.index, 'aside'))} className={`${btn()} flex-1`}>Set all aside</button>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-[11px] font-semibold tracking-wider uppercase opacity-60">View</h2>
          <div className="flex flex-wrap gap-1.5">
            {VIEW_BUTTONS.map(({ view: v, label }) => (
              <button key={v} onClick={() => chooseView(v)} className={`${btn(v === view)} flex-1`}>{label}</button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => setSpin(s => !s)} className={`${btn(spin)} flex-1`}>Slow turn</button>
            <button onClick={() => setBoxOnly(b => !b)} className={`${btn(boxOnly)} flex-1`}>{boxOnly ? 'Show bars again' : 'Show box only'}</button>
          </div>
          <button onClick={() => { void exportPNG() }} className={`${btn()} border-neutral-400`}>Export this view as PNG</button>
          <p className="text-xs opacity-60">{exportNote ?? 'Saves the instrument at twice screen resolution on a transparent background.'}</p>
        </section>

        <p className="text-xs opacity-50 leading-relaxed">
          ← → change bar · S seat · L lift · R rest in box · A aside · D show the move · M mallets · Esc select none
        </p>
      </aside>

      <div className="flex-1 min-w-0 relative">
        <canvas
          ref={canvasRef}
          onPointerDown={() => { void sounds.unlock() }}
          className="absolute inset-0 w-full h-full block touch-none cursor-grab"
          aria-label="Three-dimensional alto xylophone"
        />
      </div>
    </div>
  )
}

export default Bench
