/**
 * The three.js side of the bar bench: builds the instrument from model.ts,
 * animates bars and mallets toward their target poses, handles picking, and
 * renders. React owns the panel; this module owns the canvas. Nothing in here
 * is unit-tested — it is exercised in the browser.
 */
import * as THREE from 'three'
import type { KeyName } from '../types'
import {
  BOX, BAR_Y, PEG_TOP, FLOOR_Y, FLOOR_TOP, HALF_LENGTH_OUT, TAPER,
  benchBars, boxWidthAt, cordZAt, innerHalfAt, holeOffset, restPose,
  type BarState, type BenchBar,
} from './model'

export type ViewName = 'three' | 'top' | 'player' | 'end'

export interface SceneCallbacks {
  /** A canvas click changed the selection (plain click, ⌘-click, or a click on nothing). */
  onSelect(index: number | null, additive: boolean): void
  /** A mallet was clicked, or a strike was requested while playing. */
  onMalletClick(): void
  onStrike(bar: BenchBar, seated: boolean): void
  onStatesChange(states: BarState[]): void
}

export interface BenchScene {
  setKey(key: KeyName): void
  bars(): BenchBar[]
  states(): BarState[]
  setBarState(index: number, state: BarState): void
  demonstrate(index: number): void
  setSelected(selected: ReadonlySet<number>): void
  setPlaying(on: boolean): void
  setView(view: ViewName): void
  setSpin(on: boolean): void
  setBoxOnly(on: boolean): void
  /** The instrument on a transparent ground at twice the canvas resolution. */
  exportPNG(): Promise<Blob>
  dispose(): void
}

const VIEWS: Record<ViewName, { theta: number; phi: number; r: number }> = {
  three:  { theta: -0.6, phi: 1.0,  r: 120 },
  top:    { theta: 0.0,  phi: 0.06, r: 115 },
  player: { theta: 0.0,  phi: 1.05, r: 110 },
  end:    { theta: -1.5, phi: 1.15, r: 120 },
}

const { wall: WALL, barWidth: BAR_W, barThickness: BAR_T, pitch: PITCH } = BOX
const HALF_W = BAR_W / 2, SHOULDER = BAR_T - 0.35, BELLY = 0.3
const HOLE_SEG = 1.2
const LIFT = 10
const SHAFT_L = 22, HEAD_R = 1.3
const HAND_UP = 9, HAND_BACK = Math.sqrt(SHAFT_L * SHAFT_L - HAND_UP * HAND_UP)
const PITCH_STRIKE = Math.asin(HAND_UP / SHAFT_L), PITCH_READY = PITCH_STRIKE - 0.5

const srgb = (hex: number) => new THREE.Color(hex)
const std = (opts: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(opts)

// ---- bar cross-section: crowned on top, gently curved underneath ----
function barGeometry(L: number): THREE.ExtrudeGeometry {
  const w = HALF_W, s = new THREE.Shape()
  s.moveTo(-w, BELLY)
  s.quadraticCurveTo(-w * 0.6, 0, 0, 0)
  s.quadraticCurveTo(w * 0.6, 0, w, BELLY)
  s.lineTo(w, SHOULDER)
  s.quadraticCurveTo(w * 0.6, BAR_T, 0, BAR_T)
  s.quadraticCurveTo(-w * 0.6, BAR_T, -w, SHOULDER)
  s.lineTo(-w, BELLY)
  const g = new THREE.ExtrudeGeometry(s, { depth: L, bevelEnabled: false, curveSegments: 10 })
  g.translate(0, 0, -L)            // bar runs from local z = -L (far end) to 0 (near end)
  g.computeVertexNormals()
  return g
}
// heights of the top and underside at a distance across the bar (inverse of the curves above)
function crownT(x: number) { const u = Math.min(Math.abs(x) / HALF_W, 1); return (-0.8 + Math.sqrt(0.64 + 0.8 * (1 - u))) / 0.4 }
function crownY(x: number) { const t = crownT(x); return (1 - t) * (1 - t) * SHOULDER + 2 * (1 - t) * t * BAR_T + t * t * BAR_T }
function bellyY(x: number) { const t = crownT(x); return (1 - t) * (1 - t) * BELLY }

/** A short slice of bar with a real hole through it, slotted between two plain extrusions. */
function holeSliceGeometry(): THREE.BufferGeometry {
  const w = HALF_W, h = HOLE_SEG, R = BOX.holeRadius
  const pos: number[] = []
  type P = [number, number, number]
  const tri = (a: P, b: P, c: P, n: P) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
    if ((uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2] < 0) [b, c] = [c, b]
    pos.push(...a, ...b, ...c)
  }
  const quad = (a: P, b: P, c: P, d: P, n: P) => { tri(a, b, c, n); tri(a, c, d, n) }
  const angs: number[] = []
  for (let k = 0; k < 48; k++) angs.push(k / 48 * Math.PI * 2)
  for (const cx of [-1, 1]) for (const cz of [-1, 1]) angs.push((Math.atan2(cz * h, cx * w) + Math.PI * 2) % (Math.PI * 2))
  angs.sort((a, b) => a - b)
  const A = angs.filter((a, i) => i === 0 || a - angs[i - 1]! > 1e-6)
  const inner = A.map(a => [R * Math.cos(a), R * Math.sin(a)] as const)
  const outer = A.map(a => {
    const c = Math.cos(a), s = Math.sin(a)
    const t = Math.min(w / Math.max(Math.abs(c), 1e-9), h / Math.max(Math.abs(s), 1e-9))
    return [t * c, t * s] as const
  })
  for (let i = 0; i < A.length; i++) {
    const j = (i + 1) % A.length
    const [ix, iz] = inner[i]!, [jx, jz] = inner[j]!, [ox, oz] = outer[i]!, [px, pz] = outer[j]!
    quad([ix, crownY(ix), iz], [jx, crownY(jx), jz], [px, crownY(px), pz], [ox, crownY(ox), oz], [0, 1, 0])
    quad([ix, bellyY(ix), iz], [jx, bellyY(jx), jz], [px, bellyY(px), pz], [ox, bellyY(ox), oz], [0, -1, 0])
    quad([ix, bellyY(ix), iz], [jx, bellyY(jx), jz], [jx, crownY(jx), jz], [ix, crownY(ix), iz], [-(ix + jx), 0, -(iz + jz)])
    if (Math.abs(Math.abs(ox) - w) < 1e-6 && Math.abs(Math.abs(px) - w) < 1e-6 && Math.sign(ox) === Math.sign(px))
      quad([ox, bellyY(ox), oz], [px, bellyY(px), pz], [px, crownY(px), pz], [ox, crownY(ox), oz], [Math.sign(ox), 0, 0])
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

function letterTexture(letter: string): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#f8f4ef'; g.font = '900 88px "Helvetica Neue", Arial, sans-serif'
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(letter, 64, 68)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  return t
}

interface BarObject {
  bar: BenchBar
  pivot: THREE.Group
  wood: THREE.MeshStandardMaterial
  rest: { ang: number; z: number }
  home: THREE.Vector3
  state: BarState
  target: { pos: THREE.Vector3; rot: THREE.Euler }
  flash: number
}

interface MalletObject {
  group: THREE.Group
  handle: THREE.Vector3; handleTarget: THREE.Vector3
  dir: THREE.Vector3; dirTarget: THREE.Vector3
  striking: boolean
  timer: ReturnType<typeof setTimeout> | null
}

export function createBenchScene(canvas: HTMLCanvasElement, initialKey: KeyName, cb: SceneCallbacks): BenchScene {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(36, 1, 1, 2000)

  scene.add(new THREE.HemisphereLight(0xfff6ea, 0x9c8b7a, 1.9))
  const SUN_SIDE_INTENSITY = 2.9, SUN_TOP_INTENSITY = 1.7
  const sun = new THREE.DirectionalLight(0xfff3e0, SUN_SIDE_INTENSITY)
  // Over the player's left shoulder from an oblique view; straight overhead as the camera
  // goes top-down, so the crowned bars shade evenly and read as a flat plan.
  const SUN_SIDE = new THREE.Vector3(-50, 110, 70), SUN_TOP = new THREE.Vector3(0.5, 140, 2)
  sun.position.copy(SUN_SIDE)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 10, far: 300 })
  sun.shadow.bias = -0.0004
  scene.add(sun)
  const fill = new THREE.DirectionalLight(0xe6edff, 1.1)
  fill.position.set(70, 30, -50)
  scene.add(fill)

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.ShadowMaterial({ opacity: 0.2 }))
  ground.rotation.x = -Math.PI / 2; ground.position.y = FLOOR_Y - 0.01; ground.receiveShadow = true
  scene.add(ground)

  // ---- materials ----
  // golden birch ply: warm faces, ply-edge ends a shade warmer still, the inside a shade deeper
  const birch = std({ color: srgb(0xecd6a4), roughness: 0.6 })
  const birchEdge = std({ color: srgb(0xdfc58c), roughness: 0.68 })
  const birchInner = std({ color: srgb(0xd3b77f), roughness: 0.74 })
  const rubber = std({ color: srgb(0x141414), roughness: 0.95 })
  const cordMat = std({ color: srgb(0x1a1a1a), roughness: 1 })
  const knobMat = std({ color: srgb(0x111111), roughness: 0.4, metalness: 0.2 })
  const holeMat = std({ color: srgb(0x4a3524), roughness: 1 })

  // ---- the box ----
  const frame = new THREE.Group(); scene.add(frame)
  const slab = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; frame.add(m); return m
  }
  const midY = -BOX.height / 2
  const HL = BOX.halfLength, HL_OUT = HALF_LENGTH_OUT
  const PLATE_T = BOX.plateThickness, PLATE_L = BOX.plateLength, PLATE_IN = BOX.plateIn
  // long walls: full length, with a cove swept into the bottom edge just inboard of each foot
  function longWall(side: -1 | 1) {
    const hl = HL_OUT / Math.cos(TAPER), yN = FLOOR_Y + BOX.notchHeight, nL = BOX.notchLength, nH = BOX.notchHeight
    const sh = new THREE.Shape()
    sh.moveTo(-hl, 0); sh.lineTo(-hl, yN); sh.lineTo(-hl + nL - nH, yN)
    sh.quadraticCurveTo(-hl + nL, yN, -hl + nL, FLOOR_Y)
    sh.lineTo(hl - nL, FLOOR_Y)
    sh.quadraticCurveTo(hl - nL, yN, hl - nL + nH, yN)
    sh.lineTo(hl, yN); sh.lineTo(hl, 0); sh.closePath()
    const g = new THREE.ExtrudeGeometry(sh, { depth: WALL, bevelEnabled: false, curveSegments: 12 })
    g.translate(0, 0, -WALL / 2)
    const m = new THREE.Mesh(g, birch)
    m.position.z = side * ((BOX.widthLow + BOX.widthHigh) / 4 - WALL / 2)
    m.rotation.y = side * TAPER
    m.castShadow = m.receiveShadow = true; frame.add(m)
  }
  longWall(-1); longWall(1)
  slab(WALL, BOX.height, boxWidthAt(-HL_OUT) + 0.6, -HL_OUT + WALL / 2, midY, 0, birchEdge)
  slab(WALL, BOX.height, boxWidthAt(HL_OUT) + 0.6, HL_OUT - WALL / 2, midY, 0, birchEdge)
  {
    const x0 = -HL_OUT + WALL, x1 = HL_OUT - WALL, f = new THREE.Shape()
    f.moveTo(x0, -innerHalfAt(x0)); f.lineTo(x1, -innerHalfAt(x1)); f.lineTo(x1, innerHalfAt(x1)); f.lineTo(x0, innerHalfAt(x0)); f.closePath()
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(f, { depth: WALL, bevelEnabled: false }), birchInner)
    m.rotation.x = -Math.PI / 2; m.position.y = FLOOR_TOP - WALL; m.receiveShadow = true; frame.add(m)
  }
  // end plates: each spans the box at its own end, so the wide low-end plate holds the mallets
  // and two knobs while the narrow high-end plate carries one knob in its centre; both sit flush
  // with the end wall below and cover the cords where they run in under them
  const LOW_PLATE_X = -(HL_OUT - PLATE_L / 2)
  const MALLET_HOLES: [number, number][] = [[LOW_PLATE_X - 1.5, -2.2], [LOW_PLATE_X + 1, 2.6]]
  for (const s of [-1, 1] as const) {
    const px = s * (HL_OUT - PLATE_L / 2), pw = boxWidthAt(s * HL_OUT) + 1
    slab(PLATE_L, PLATE_T, pw, px, PLATE_T / 2, 0, birch)
    const kx = s * (HL_OUT - 2.2)
    for (const kz of (s < 0 ? [-cordZAt(kx), cordZAt(kx)] : [0])) {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.75, 20, 14), knobMat)
      knob.position.set(kx, PLATE_T + 0.3, kz); knob.castShadow = true; frame.add(knob)
    }
    if (s < 0) for (const [hx, hz] of MALLET_HOLES) {
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.3, 24), holeMat)
      h.position.set(hx, PLATE_T + 0.05, hz); frame.add(h)
    }
  }
  // twisted cord along each wall top, end wall to end wall
  const CORD_END = HL_OUT - WALL - 0.2
  class Strand extends THREE.Curve<THREE.Vector3> {
    constructor(private side: number, private phase: number) { super() }
    override getPoint(t: number, out = new THREE.Vector3()): THREE.Vector3 {
      const x = -CORD_END + t * 2 * CORD_END, a = t * 2 * CORD_END / 1.5 * Math.PI * 2 + this.phase, r = 0.28
      return out.set(x, BOX.cordY + r * Math.cos(a), this.side * cordZAt(x) + r * Math.sin(a))
    }
  }
  for (const side of [-1, 1]) for (const ph of [0, Math.PI]) {
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new Strand(side, ph), 480, 0.27, 8, false), cordMat)
    tube.castShadow = true; frame.add(tube)
  }
  // rubber pegs: through each bar's hole on the far side, between bars on the near side
  const plateTop = (x: number) => (Math.abs(x) > HL - PLATE_IN ? PLATE_T : 0)
  function peg(x: number, z: number) {
    const base = plateTop(x), h = PEG_TOP - base
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, h, 14), rubber)
    p.position.set(x, base + h / 2, z); p.castShadow = true; frame.add(p)
  }

  // ---- bars ----
  const barGroup = new THREE.Group(); scene.add(barGroup)
  const pegGroup = new THREE.Group(); frame.add(pegGroup)
  const dotGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.06, 24)
  const sliceGeo = holeSliceGeometry()
  let objects: BarObject[] = []
  let selected: ReadonlySet<number> = new Set()
  const HIGHLIGHT = new THREE.Color(0x3a2210), BLACK = new THREE.Color(0x000000), FLASH = new THREE.Color(0xffd9a8)

  function setTarget(o: BarObject) {
    const { target: t, home, bar, rest } = o
    const x = bar.x, L = bar.length
    switch (o.state) {
      case 'seated': t.pos.copy(home); t.rot.set(0, 0, 0); break
      case 'lifted': t.pos.set(x, home.y + LIFT, home.z); t.rot.set(0, 0, 0); break
      case 'tilted': t.pos.set(x, home.y + LIFT - 2, rest.z); t.rot.set(rest.ang, 0, 0); break
      case 'rested': t.pos.set(x, FLOOR_TOP + 0.05, rest.z); t.rot.set(rest.ang, 0, 0); break
      case 'aside':  t.pos.set(x, FLOOR_Y + 0.02, boxWidthAt(x) / 2 + 12 + L); t.rot.set(0, 0, 0); break
    }
  }

  const demoTimers = new Map<number, ReturnType<typeof setTimeout>>()
  function buildBars(key: KeyName) {
    for (const t of demoTimers.values()) clearTimeout(t)
    demoTimers.clear()
    barGroup.clear(); pegGroup.clear()
    const bars = benchBars(key)
    for (let i = 0; i <= bars.length; i++) { const x = (i - bars.length / 2) * PITCH; peg(x, cordZAt(x)) }
    objects = bars.map(bar => {
      const { x, length: L } = bar
      peg(x, -cordZAt(x))
      const shade = 0.94 + 0.12 * ((bar.index * 7) % 5) / 5
      const wood = std({ color: srgb(0x9e5348).multiplyScalar(shade), roughness: 0.55 })
      const pivot = new THREE.Group()
      const zHole = holeOffset(L, x)
      const farPiece = new THREE.Mesh(barGeometry(L + zHole - HOLE_SEG), wood); farPiece.position.z = zHole - HOLE_SEG
      const slice = new THREE.Mesh(sliceGeo, wood); slice.position.z = zHole
      const nearPiece = new THREE.Mesh(barGeometry(-(zHole + HOLE_SEG)), wood)
      for (const m of [farPiece, slice, nearPiece]) { m.castShadow = m.receiveShadow = true; pivot.add(m) }
      const [r, g, b] = bar.colour
      const dot = new THREE.Mesh(dotGeo, std({ color: new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace), roughness: 0.5 }))
      dot.position.set(0, BAR_T + 0.02, -L + 1.3); pivot.add(dot)
      const letter = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ map: letterTexture(bar.letter), transparent: true }))
      letter.rotation.x = -Math.PI / 2; letter.position.set(0, BAR_T + 0.04, -2.2); pivot.add(letter)
      const home = new THREE.Vector3(x, BAR_Y, L / 2)
      pivot.position.copy(home)
      barGroup.add(pivot)
      const o: BarObject = { bar, pivot, wood, rest: restPose(x), home, state: 'seated', target: { pos: home.clone(), rot: new THREE.Euler() }, flash: 0 }
      setTarget(o)
      return o
    })
    // the pegs were added to `frame` by peg(); move the ones just made under pegGroup so a rebuild can clear them
    for (const child of [...frame.children]) if (child instanceof THREE.Mesh && child.material === rubber) { frame.remove(child); pegGroup.add(child) }
    applySelection()
    cb.onStatesChange(objects.map(o => o.state))
  }
  function applySelection() {
    objects.forEach((o, i) => { o.flash = 0; o.wood.emissive.copy(selected.has(i) ? HIGHLIGHT : BLACK) })
  }

  // ---- mallets ----
  const malletGroup = new THREE.Group(); scene.add(malletGroup)
  const shaftMat = std({ color: srgb(0x141414), roughness: 0.6 })
  const headMat = std({ color: srgb(0xe9e2d3), roughness: 1 })
  const mallets: MalletObject[] = [0, 1].map(() => {
    const g = new THREE.Group()
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, SHAFT_L, 12), shaftMat)
    shaft.rotation.x = Math.PI / 2; shaft.position.z = SHAFT_L / 2; shaft.castShadow = true; g.add(shaft)
    const head = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R, 24, 18), headMat)
    head.position.z = SHAFT_L; head.castShadow = true; g.add(head)
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.2, 12), shaftMat)
    collar.rotation.x = Math.PI / 2; collar.position.z = SHAFT_L - HEAD_R - 0.4; g.add(collar)
    const grab = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, SHAFT_L + 2, 8), new THREE.MeshBasicMaterial({ visible: false }))
    grab.rotation.x = Math.PI / 2; grab.position.z = SHAFT_L / 2; g.add(grab)
    malletGroup.add(g)
    return { group: g, handle: new THREE.Vector3(), handleTarget: new THREE.Vector3(), dir: new THREE.Vector3(), dirTarget: new THREE.Vector3(), striking: false, timer: null }
  })
  // resting: standing in the plate holes, most of the shaft down through the hole
  function malletRest(k: number) {
    const [hx, hz] = MALLET_HOLES[k]!
    const up = (k === 0 ? new THREE.Vector3(-0.05, 1, -0.06) : new THREE.Vector3(0.04, 1, 0.09)).normalize()
    return { handle: new THREE.Vector3(hx, PLATE_T, hz).addScaledVector(up, -11), dir: up }
  }
  const dirAt = (pitch: number) => new THREE.Vector3(0, -Math.sin(pitch), -Math.cos(pitch))
  const hitPoint = (o: BarObject) => o.pivot.localToWorld(new THREE.Vector3(0, BAR_T, -o.bar.length / 2))
  const handOver = (hp: THREE.Vector3) => hp.clone().add(new THREE.Vector3(0, HEAD_R + HAND_UP, HAND_BACK))
  function setMallet(m: MalletObject, handle: THREE.Vector3, dir: THREE.Vector3, snap = false) {
    m.handleTarget.copy(handle); m.dirTarget.copy(dir)
    if (snap) { m.handle.copy(handle); m.dir.copy(dir) }
  }
  let playing = false
  mallets.forEach((m, k) => { const r = malletRest(k); setMallet(m, r.handle, r.dir, true) })

  function strike(o: BarObject) {
    const hp = hitPoint(o), hand = handOver(hp)
    const m = mallets.reduce((a, b) => (Math.abs(a.handle.x - hp.x) <= Math.abs(b.handle.x - hp.x) ? a : b))
    if (m.timer) clearTimeout(m.timer)
    m.striking = true
    setMallet(m, hand, dirAt(PITCH_STRIKE))
    m.timer = setTimeout(() => {
      cb.onStrike(o.bar, o.state === 'seated')
      o.flash = 1
      setMallet(m, hand, dirAt(PITCH_READY))
      m.striking = false
    }, reduce ? 0 : 50)
  }

  // ---- camera and pointer ----
  const orbit = { theta: -0.6, phi: 1.0, r: 120, target: new THREE.Vector3(0, -6, 0), spin: false }
  let camGoal: { theta: number; phi: number; r: number } | null = { ...VIEWS.three }
  function applyCamera() {
    const o = orbit
    camera.position.set(
      o.target.x + o.r * Math.sin(o.phi) * Math.sin(o.theta),
      o.target.y + o.r * Math.cos(o.phi),
      o.target.z + o.r * Math.sin(o.phi) * Math.cos(o.theta))
    camera.lookAt(o.target)
  }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
  function pick(e: PointerEvent, group: THREE.Group): THREE.Object3D | null {
    const r = canvas.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const hit = ray.intersectObjects(group.children, true)[0]
    if (!hit) return null
    let o: THREE.Object3D = hit.object
    while (o.parent && o.parent !== group) o = o.parent
    return o
  }
  let drag: { x: number; y: number } | null = null, moved = 0
  const onDown = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY }; moved = 0; canvas.classList.add('cursor-grabbing'); canvas.setPointerCapture(e.pointerId) }
  const onMove = (e: PointerEvent) => {
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; moved += Math.abs(dx) + Math.abs(dy)
      orbit.theta -= dx * 0.006; orbit.phi = THREE.MathUtils.clamp(orbit.phi - dy * 0.006, 0.05, 1.5)
      camGoal = null; orbit.spin = false
      drag.x = e.clientX; drag.y = e.clientY
    } else canvas.classList.toggle('cursor-pointer', !!(pick(e, malletGroup) || pick(e, barGroup)))
  }
  const onUp = (e: PointerEvent) => {
    canvas.classList.remove('cursor-grabbing')
    if (drag && moved < 6) {
      if (pick(e, malletGroup)) cb.onMalletClick()
      else {
        const hit = pick(e, barGroup)
        const o = hit ? objects.find(x => x.pivot === hit) : undefined
        if (o) { if (playing) strike(o); else cb.onSelect(o.bar.index, e.metaKey || e.ctrlKey) }
        else if (!playing) cb.onSelect(null, false)
      }
    }
    drag = null
  }
  const onWheel = (e: WheelEvent) => { e.preventDefault(); orbit.r = THREE.MathUtils.clamp(orbit.r * (1 + e.deltaY * 0.001), 50, 400); camGoal = null }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('wheel', onWheel, { passive: false })

  // ---- sizing and the frame loop ----
  function resize() {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(canvas)
  resize()

  const ease = reduce ? 1 : 0.1
  const q = new THREE.Quaternion(), headTmp = new THREE.Vector3()
  let raf = 0
  function tick() {
    raf = requestAnimationFrame(tick)
    if (camGoal) {
      orbit.theta += (camGoal.theta - orbit.theta) * 0.08
      orbit.phi += (camGoal.phi - orbit.phi) * 0.08
      orbit.r += (camGoal.r - orbit.r) * 0.08
      if (Math.abs(camGoal.theta - orbit.theta) + Math.abs(camGoal.phi - orbit.phi) + Math.abs(camGoal.r - orbit.r) < 0.002) camGoal = null
    }
    if (orbit.spin) orbit.theta += 0.004
    applyCamera()
    // Overhead, the sun lands square on every top face, so it also eases off as it climbs.
    const overhead = THREE.MathUtils.clamp((0.5 - orbit.phi) / 0.3, 0, 1)
    sun.position.lerpVectors(SUN_SIDE, SUN_TOP, overhead)
    sun.intensity = THREE.MathUtils.lerp(SUN_SIDE_INTENSITY, SUN_TOP_INTENSITY, overhead)
    for (const o of objects) {
      o.pivot.position.lerp(o.target.pos, ease)
      q.setFromEuler(o.target.rot); o.pivot.quaternion.slerp(q, ease)
      if (o.flash) {
        const base = selected.has(o.bar.index) ? HIGHLIGHT : BLACK
        o.wood.emissive.copy(base).lerp(FLASH, o.flash * 0.6)
        o.flash *= reduce ? 0 : 0.82
        if (o.flash < 0.02) { o.flash = 0; o.wood.emissive.copy(base) }
      }
    }
    for (const m of mallets) {
      const k = reduce ? 1 : (m.striking ? 0.7 : (playing ? 0.3 : 0.16))
      m.handle.lerp(m.handleTarget, k); m.dir.lerp(m.dirTarget, k).normalize()
      m.group.position.copy(m.handle)
      m.group.lookAt(headTmp.copy(m.handle).addScaledVector(m.dir, SHAFT_L))
    }
    renderer.render(scene, camera)
  }

  buildBars(initialKey)
  tick()

  return {
    setKey(key) { buildBars(key) },
    bars: () => objects.map(o => o.bar),
    states: () => objects.map(o => o.state),
    setBarState(index, state) {
      const o = objects[index]; if (!o) return
      o.state = state; setTarget(o)
      cb.onStatesChange(objects.map(x => x.state))
    },
    demonstrate(index) {
      const step = reduce ? 350 : 1000
      const t = demoTimers.get(index); if (t) clearTimeout(t)
      this.setBarState(index, 'lifted')
      demoTimers.set(index, setTimeout(() => {
        this.setBarState(index, 'tilted')
        demoTimers.set(index, setTimeout(() => this.setBarState(index, 'rested'), step))
      }, step))
    },
    setSelected(next) { selected = next; applySelection() },
    setPlaying(on) {
      playing = on
      mallets.forEach((m, k) => {
        if (on) { const o = objects[k === 0 ? 3 : 9] ?? objects[0]!; setMallet(m, handOver(hitPoint(o)), dirAt(PITCH_READY)) }
        else { const r = malletRest(k); setMallet(m, r.handle, r.dir) }
      })
    },
    setView(view) { camGoal = { ...VIEWS[view] }; orbit.spin = false },
    setSpin(on) { orbit.spin = on; if (on) camGoal = null },
    setBoxOnly(on) { barGroup.visible = !on },
    exportPNG() {
      return new Promise<Blob>((resolve, reject) => {
        const w = canvas.clientWidth, h = canvas.clientHeight
        ground.visible = false
        renderer.setPixelRatio(1); renderer.setSize(w * 2, h * 2, false)
        renderer.render(scene, camera)
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png')
        ground.visible = true
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); resize()
      })
    },
    dispose() {
      cancelAnimationFrame(raf)
      observer.disconnect()
      for (const t of demoTimers.values()) clearTimeout(t)
      for (const m of mallets) if (m.timer) clearTimeout(m.timer)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('wheel', onWheel)
      renderer.dispose()
    },
  }
}
