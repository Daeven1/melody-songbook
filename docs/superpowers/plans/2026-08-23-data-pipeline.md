# Melody Songbook — Data Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the 21 MuseScore files in `source/` into validated, committed JSON that the play-along app consumes, with every corpus invariant enforced as a build-time check.

**Architecture:** A Node/TypeScript CLI reads `.mscz` archives, walks the `.mscx` XML inside, splits each file into its four key sections at title-frame boundaries, and emits `src/data/songs.json` and `src/data/borduns.json`. The browser never parses MuseScore. Everything is a pure function over parsed XML, so the whole pipeline is testable without a browser.

**Tech Stack:** TypeScript, Vite, Vitest, `fflate` (zip), `@xmldom/xmldom` (XML), React + Tailwind (scaffolded here, used in Plan 2).

**Spec:** `docs/superpowers/specs/2026-08-23-melody-songbook-playalong-design.md`

## Global Constraints

- Node 24 LTS. TypeScript strict mode on.
- The importer is **build-time only**. Nothing under `src/` may import `fflate`, `@xmldom/xmldom`, or anything under `scripts/`.
- Every invariant below currently holds across all 21 files. They are regression guards on future edits — the importer **fails the build**, never warns, when one breaks:
  - time signature is exactly 4/4
  - exactly one `Part` and one `Staff` per file
  - exactly 4 title frames (sections) per song file; 20 in the canonical bordun file
  - chord durations are only `half`, `quarter`, `eighth`
  - no `Tie`, `Dot`, `Slur`, `Volta`, or repeat elements anywhere
  - every note's colour matches the verified table exactly
  - each bar's durations sum to a whole 4/4 bar
- Verified colour table (RGB), by pitch class: C `226,28,72` · D `249,157,28` · E `255,243,43` · F `188,216,95` · F♯ `98,188,71` · G `0,156,149` · A `94,80,161` · B♭ `141,91,166` · B `207,62,150`.
- Bordun playback transposition is **−24 semitones**, applied in Plan 2's schedule builder only. The imported data stores written pitch.
- `source/_superseded/` is never read.

## Deviations from the spec (deliberate, with reason)

1. **`KeyVersion.notes` becomes `KeyVersion.bars: Bar[]`.** Phrase boxes and system breaks are both bar-indexed; a flat note list would force every consumer to re-derive bar boundaries.
2. **`Song.titleAlt` is dropped.** *Mò Lì Huā 茉莉花* is a single authored title string in the file; splitting it into two fields invents a boundary MuseScore does not record.
3. **`KeyVersion.label` is read from the file, not derived.** Labels are pedagogical (`GA EDC`, and `CDEGA` for a song using only four of those notes), not sorted pitch sets. The derived-label test becomes a subset check.
4. **`systemBreaks` is computed, not imported.** The corpus contains no `line` layout breaks.

---

### Task 1: Project scaffold and shared types

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`, `index.html`, `src/main.tsx`, `src/index.css`, `.gitignore` (already exists — extend)
- Create: `src/types.ts`
- Test: `tests/types.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: every type below, imported by every later task. `KEY_NAMES: readonly KeyName[]`, `DURATIONS: readonly Duration[]`.

- [ ] **Step 1: Scaffold the project**

```bash
cd /Users/drempel/Documents/Code/melody-songbook
npm init -y
npm i react react-dom
npm i -D vite @vitejs/plugin-react typescript @types/react @types/react-dom \
        vitest tailwindcss@3 postcss autoprefixer tsx \
        fflate @xmldom/xmldom @types/node
```

Do **not** run `npx tailwindcss init -p`. It writes CommonJS config files, which break as
soon as `package.json` gains `"type": "module"` in Step 2. Write both configs by hand instead.

- [ ] **Step 2: Write the config files**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src", "scripts", "tests"]
}
```

`vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: { globals: true, environment: 'node', include: ['tests/**/*.test.ts'] },
})
```

`tailwind.config.js`:

```js
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
```

`postcss.config.js`:

```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
}
```

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Melody Songbook</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`src/main.tsx`:

```tsx
import { createRoot } from 'react-dom/client'
import './index.css'

createRoot(document.getElementById('root')!).render(<h1>Melody Songbook</h1>)
```

Add to `package.json` scripts:

```json
{
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest run",
    "import": "tsx scripts/import/index.ts"
  }
}
```

- [ ] **Step 3: Write the failing test for shared types**

`tests/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { KEY_NAMES, DURATIONS } from '../src/types'

describe('shared constants', () => {
  it('lists the four songbook keys in book order', () => {
    expect(KEY_NAMES).toEqual(['C', 'D', 'F', 'G'])
  })

  it('lists only the durations the corpus uses', () => {
    expect(DURATIONS).toEqual(['half', 'quarter', 'eighth'])
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run tests/types.test.ts`
Expected: FAIL — cannot resolve `../src/types`

- [ ] **Step 5: Write `src/types.ts`**

```ts
export type Duration = 'half' | 'quarter' | 'eighth'
export type KeyName = 'C' | 'D' | 'F' | 'G'

export const KEY_NAMES = ['C', 'D', 'F', 'G'] as const satisfies readonly KeyName[]
export const DURATIONS = ['half', 'quarter', 'eighth'] as const satisfies readonly Duration[]

/** Ticks per quarter note. MuseScore's <Division> is 480 throughout this corpus. */
export const TICKS_PER_QUARTER = 480
export const TICKS_PER_BAR = TICKS_PER_QUARTER * 4

export const DURATION_TICKS: Record<Duration, number> = {
  half: TICKS_PER_QUARTER * 2,
  quarter: TICKS_PER_QUARTER,
  eighth: TICKS_PER_QUARTER / 2,
}

export interface LyricSyllable {
  text: string
  syllabic: 'single' | 'begin' | 'middle' | 'end'
}

export interface Note {
  /** MIDI note number; null means a rest. */
  pitch: number | null
  /** MuseScore tonal pitch class — determines spelling. null for rests. */
  tpc: number | null
  /** Additional pitches sounding with `pitch`, for bordun dyads. Empty for melodies. */
  extraPitches: number[]
  duration: Duration
  /** Index 0 is the main lyric line, index 1 the romanisation where present. */
  lyrics: LyricSyllable[]
}

export interface Bar {
  notes: Note[]
}

export interface KeyVersion {
  /** Authored label from the title frame, e.g. 'GE', 'DEF#AB', 'GA EDC'. */
  label: string
  bars: Bar[]
  /** Bar indices at which a new system (line) starts. Never includes 0. */
  systemBreaks: number[]
}

export interface Song {
  id: string
  title: string
  level: 1 | 2 | 3 | 4
  timeSignature: [4, 4]
  keys: Record<KeyName, KeyVersion>
  defaultTempo: number
}

export type BordunId =
  | 'chord'
  | 'broken'
  | 'levels'
  | 'crossover'
  | 'crossover-challenge'

export interface BordunEvent {
  /** Zero-based beat within the one-bar pattern. */
  beat: number
  /** Written pitches. Playback applies −24 semitones. */
  pitches: number[]
  duration: Duration
  hand: 'L' | 'R' | 'both'
}

export interface Bordun {
  id: BordunId
  label: string
  isChallenge: boolean
  /** One bar per key, looped under the melody. */
  keys: Record<KeyName, BordunEvent[]>
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/types.test.ts`
Expected: PASS, 2 tests

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: scaffold Vite/React/TS/Tailwind project and shared types"
```

---

### Task 2: Pitch and spelling utilities

MuseScore stores a tonal pitch class (`tpc`) alongside MIDI pitch. It is what distinguishes F♯ from G♭, and the app needs it to draw the right accidental.

The mapping, verified against the corpus (tpc 15 = G natural, tpc 12 = B♭, tpc 20 = F♯):

- Letters cycle in fifths from tpc 13: `F C G D A E B`
- `letterIndex = ((tpc - 13) % 7 + 7) % 7`
- `alteration = Math.floor((tpc - 13) / 7)` → `0` natural, `1` sharp, `-1` flat

**Files:**
- Create: `src/music/pitch.ts`
- Test: `tests/music/pitch.test.ts`

**Interfaces:**
- Consumes: `src/types.ts`
- Produces: `pitchClass(midi: number): number`, `octaveOf(midi: number): number`, `noteLetter(tpc: number): string`, `alterationOf(tpc: number): number`, `accidentalSymbol(tpc: number): '' | '#' | 'b' | '##' | 'bb'`, `spelledName(tpc: number): string`

- [ ] **Step 1: Write the failing test**

`tests/music/pitch.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  pitchClass, octaveOf, noteLetter, alterationOf, accidentalSymbol, spelledName,
} from '../../src/music/pitch'

describe('pitchClass', () => {
  it('reduces MIDI numbers to 0-11', () => {
    expect(pitchClass(60)).toBe(0)   // C4
    expect(pitchClass(67)).toBe(7)   // G4
    expect(pitchClass(64)).toBe(4)   // E4
  })
})

describe('octaveOf', () => {
  it('uses scientific pitch notation where MIDI 60 is C4', () => {
    expect(octaveOf(60)).toBe(4)
    expect(octaveOf(72)).toBe(5)
  })
})

describe('tpc spelling', () => {
  it('reads a natural G from the corpus (tpc 15)', () => {
    expect(noteLetter(15)).toBe('G')
    expect(alterationOf(15)).toBe(0)
    expect(accidentalSymbol(15)).toBe('')
    expect(spelledName(15)).toBe('G')
  })

  it('reads a B-flat from the corpus (tpc 12)', () => {
    expect(noteLetter(12)).toBe('B')
    expect(alterationOf(12)).toBe(-1)
    expect(accidentalSymbol(12)).toBe('b')
    expect(spelledName(12)).toBe('Bb')
  })

  it('reads an F-sharp as a sharpened F, never a flattened G (tpc 20)', () => {
    expect(noteLetter(20)).toBe('F')
    expect(alterationOf(20)).toBe(1)
    expect(accidentalSymbol(20)).toBe('#')
    expect(spelledName(20)).toBe('F#')
  })

  it('covers every natural letter', () => {
    const naturals = [13, 14, 15, 16, 17, 18, 19].map(noteLetter)
    expect(naturals).toEqual(['F', 'C', 'G', 'D', 'A', 'E', 'B'])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/music/pitch.test.ts`
Expected: FAIL — cannot resolve `../../src/music/pitch`

- [ ] **Step 3: Write `src/music/pitch.ts`**

```ts
/** Letters in fifths order, starting at tpc 13. */
const LETTERS_IN_FIFTHS = ['F', 'C', 'G', 'D', 'A', 'E', 'B'] as const

/** tpc of F natural — the anchor of the fifths cycle. */
const TPC_F_NATURAL = 13

export function pitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12
}

export function octaveOf(midi: number): number {
  return Math.floor(midi / 12) - 1
}

export function noteLetter(tpc: number): string {
  const index = (((tpc - TPC_F_NATURAL) % 7) + 7) % 7
  return LETTERS_IN_FIFTHS[index]!
}

/** 0 natural, 1 sharp, -1 flat, 2 double-sharp, -2 double-flat. */
export function alterationOf(tpc: number): number {
  return Math.floor((tpc - TPC_F_NATURAL) / 7)
}

export function accidentalSymbol(tpc: number): '' | '#' | 'b' | '##' | 'bb' {
  switch (alterationOf(tpc)) {
    case 0: return ''
    case 1: return '#'
    case -1: return 'b'
    case 2: return '##'
    case -2: return 'bb'
    default: throw new Error(`Unsupported alteration for tpc ${tpc}`)
  }
}

export function spelledName(tpc: number): string {
  return noteLetter(tpc) + accidentalSymbol(tpc)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/music/pitch.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/music/pitch.ts tests/music/pitch.test.ts
git commit -m "feat: pitch class and tpc spelling utilities"
```

---

### Task 3: Verified colour table

**Files:**
- Create: `src/music/colours.ts`
- Test: `tests/music/colours.test.ts`

**Interfaces:**
- Consumes: `src/music/pitch.ts`
- Produces: `PITCH_COLOURS: Readonly<Record<number, RGB>>`, `type RGB = readonly [number, number, number]`, `colourForPitch(midi: number): RGB`, `rgbToCss(rgb: RGB): string`

- [ ] **Step 1: Write the failing test**

`tests/music/colours.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { PITCH_COLOURS, colourForPitch, rgbToCss } from '../../src/music/colours'

describe('colour table', () => {
  it('matches the values harvested from the MuseScore corpus', () => {
    expect(PITCH_COLOURS[0]).toEqual([226, 28, 72])    // C
    expect(PITCH_COLOURS[2]).toEqual([249, 157, 28])   // D
    expect(PITCH_COLOURS[4]).toEqual([255, 243, 43])   // E
    expect(PITCH_COLOURS[5]).toEqual([188, 216, 95])   // F
    expect(PITCH_COLOURS[6]).toEqual([98, 188, 71])    // F#
    expect(PITCH_COLOURS[7]).toEqual([0, 156, 149])    // G
    expect(PITCH_COLOURS[9]).toEqual([94, 80, 161])    // A
    expect(PITCH_COLOURS[10]).toEqual([141, 91, 166])  // Bb
    expect(PITCH_COLOURS[11]).toEqual([207, 62, 150])  // B
  })

  it('covers exactly the nine pitch classes the corpus uses', () => {
    expect(Object.keys(PITCH_COLOURS).map(Number).sort((a, b) => a - b))
      .toEqual([0, 2, 4, 5, 6, 7, 9, 10, 11])
  })

  it('resolves a colour from any octave of the same pitch class', () => {
    expect(colourForPitch(67)).toEqual([0, 156, 149])  // G4
    expect(colourForPitch(79)).toEqual([0, 156, 149])  // G5
  })

  it('throws for a pitch class the songbook never uses', () => {
    expect(() => colourForPitch(61)).toThrow(/C#/)     // pitch class 1
  })

  it('formats CSS', () => {
    expect(rgbToCss([0, 156, 149])).toBe('rgb(0, 156, 149)')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/music/colours.test.ts`
Expected: FAIL — cannot resolve `../../src/music/colours`

- [ ] **Step 3: Write `src/music/colours.ts`**

```ts
import { pitchClass } from './pitch'

export type RGB = readonly [number, number, number]

const PITCH_CLASS_NAMES = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B',
] as const

/**
 * Boomwhacker colours, harvested from Lacie's MuseScore files. Every note in the
 * corpus (~2,000) agrees with this table; the importer asserts it on every import
 * so a future edit that breaks the convention fails the build.
 */
export const PITCH_COLOURS: Readonly<Record<number, RGB>> = {
  0: [226, 28, 72],    // C
  2: [249, 157, 28],   // D
  4: [255, 243, 43],   // E
  5: [188, 216, 95],   // F
  6: [98, 188, 71],    // F#
  7: [0, 156, 149],    // G
  9: [94, 80, 161],    // A
  10: [141, 91, 166],  // Bb
  11: [207, 62, 150],  // B
}

export function colourForPitch(midi: number): RGB {
  const pc = pitchClass(midi)
  const colour = PITCH_COLOURS[pc]
  if (!colour) {
    throw new Error(
      `No songbook colour for pitch class ${pc} (${PITCH_CLASS_NAMES[pc]}); ` +
      `the songbook never uses this note.`,
    )
  }
  return colour
}

export function rgbToCss(rgb: RGB): string {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/music/colours.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/music/colours.ts tests/music/colours.test.ts
git commit -m "feat: verified Boomwhacker colour table"
```

---

### Task 4: Read `.mscz`, walk the XML, split into sections

Sections are delimited by **title frames** (`VBox`), not by layout-break subtype. Every song file has exactly 4; the canonical bordun file has 20. One splitter serves both.

**Files:**
- Create: `scripts/import/mscz.ts`, `scripts/import/dom.ts`, `scripts/import/sections.ts`
- Test: `tests/import/sections.test.ts`

**Interfaces:**
- Consumes: `src/types.ts`
- Produces:
  - `readMscz(path: string): Document`
  - `childElements(el: Element): Element[]`, `firstChildNamed(el: Element, name: string): Element | null`, `textOf(el: Element, childName: string): string | null`, `frameText(textEl: Element): string`
  - `musicStaff(doc: Document): Element`
  - `extractSections(staff: Element): RawSection[]` where `interface RawSection { texts: SectionText[]; measures: Element[] }` and `interface SectionText { style: string; text: string }`

- [ ] **Step 1: Write the failing test**

`tests/import/sections.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readMscz } from '../../scripts/import/mscz'
import { musicStaff, extractSections } from '../../scripts/import/sections'

const GOODNIGHT = 'source/G2 Melodies Level 1 (Goodnight, Sleep Tight).mscz'
const MO_LI_HUA = 'source/G2 Melodies Level 4 (Mo Lie Hua).mscz'
const OLD_MACDONALD = 'source/G2 Melodies Level 3 (Old Macdonald).mscz'

describe('extractSections', () => {
  it('splits a song into its four key sections', () => {
    const sections = extractSections(musicStaff(readMscz(GOODNIGHT)))
    expect(sections).toHaveLength(4)
    expect(sections.map(s => s.measures.length)).toEqual([2, 2, 2, 2])
  })

  it('reads the level heading, song title and key label from the first frame', () => {
    const [first] = extractSections(musicStaff(readMscz(GOODNIGHT)))
    expect(first!.texts).toEqual([
      { style: 'title', text: 'LEVEL 1:' },
      { style: 'subtitle', text: 'Good Night, Sleep Tight' },
      { style: 'subtitle', text: 'GE' },
    ])
  })

  it('reads later frames as title plus key label only', () => {
    const sections = extractSections(musicStaff(readMscz(GOODNIGHT)))
    expect(sections.map(s => s.texts.at(-1)!.text)).toEqual(['GE', 'AF#', 'CA', 'DB'])
  })

  it('preserves diacritics and Chinese characters', () => {
    const [first] = extractSections(musicStaff(readMscz(MO_LI_HUA)))
    expect(first!.texts[1]!.text).toBe('Mò Lì Huā 茉莉花')
  })

  it('renders the subscript symbol in a key label', () => {
    const [first] = extractSections(musicStaff(readMscz(MO_LI_HUA)))
    expect(first!.texts.at(-1)!.text).toBe('CDEGA C₁')
  })

  it('handles a file whose frames carry no LEVEL heading', () => {
    const sections = extractSections(musicStaff(readMscz(OLD_MACDONALD)))
    expect(sections).toHaveLength(4)
    expect(sections[0]!.texts.map(t => t.text))
      .toEqual(['ECE Has a Music Room', 'GA EDC'])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/import/sections.test.ts`
Expected: FAIL — cannot resolve `../../scripts/import/mscz`

- [ ] **Step 3: Write `scripts/import/mscz.ts`**

```ts
import { readFileSync } from 'node:fs'
import { unzipSync } from 'fflate'
import { DOMParser } from '@xmldom/xmldom'

/** Reads a MuseScore archive and returns the parsed .mscx document inside it. */
export function readMscz(path: string): Document {
  const archive = unzipSync(new Uint8Array(readFileSync(path)))
  const entry = Object.keys(archive).find(name => name.endsWith('.mscx'))
  if (!entry) throw new Error(`No .mscx inside ${path}`)
  const xml = new TextDecoder().decode(archive[entry]!)
  return new DOMParser().parseFromString(xml, 'text/xml') as unknown as Document
}
```

- [ ] **Step 4: Write `scripts/import/dom.ts`**

```ts
const ELEMENT_NODE = 1

export function childElements(el: Element): Element[] {
  const out: Element[] = []
  for (let i = 0; i < el.childNodes.length; i++) {
    const node = el.childNodes[i]!
    if (node.nodeType === ELEMENT_NODE) out.push(node as Element)
  }
  return out
}

export function firstChildNamed(el: Element, name: string): Element | null {
  return childElements(el).find(child => child.nodeName === name) ?? null
}

export function textOf(el: Element, childName: string): string | null {
  const child = firstChildNamed(el, childName)
  return child ? (child.textContent ?? '').trim() : null
}

/**
 * MuseScore encodes some characters as SMuFL symbols rather than text — the
 * subscript in "CDEGA C₁" arrives as <sym>tuplet1</sym>. Unknown symbols throw
 * rather than being silently dropped from a title.
 */
const SYMBOL_TEXT: Record<string, string> = {
  tuplet0: '₀', tuplet1: '₁', tuplet2: '₂', tuplet3: '₃', tuplet4: '₄',
  tuplet5: '₅', tuplet6: '₆', tuplet7: '₇', tuplet8: '₈', tuplet9: '₉',
}

/** Flattens a MuseScore <text> element, resolving <sym> children. */
export function frameText(textEl: Element): string {
  let out = ''
  for (let i = 0; i < textEl.childNodes.length; i++) {
    const node = textEl.childNodes[i]!
    if (node.nodeType === ELEMENT_NODE) {
      const child = node as Element
      if (child.nodeName === 'sym') {
        const name = (child.textContent ?? '').trim()
        const replacement = SYMBOL_TEXT[name]
        if (replacement === undefined) {
          throw new Error(`Unhandled MuseScore symbol <sym>${name}</sym> in a text frame`)
        }
        out += replacement
      } else {
        // <font> and similar carry no text of their own in this corpus.
        out += child.textContent ?? ''
      }
    } else {
      out += node.nodeValue ?? ''
    }
  }
  return out.trim()
}
```

- [ ] **Step 5: Write `scripts/import/sections.ts`**

```ts
import { childElements, firstChildNamed, textOf, frameText } from './dom'

export interface SectionText {
  style: string
  text: string
}

export interface RawSection {
  texts: SectionText[]
  measures: Element[]
}

/** The one Score-level Staff that holds the music (the Part's Staff is nested inside Part). */
export function musicStaff(doc: Document): Element {
  const score = firstChildNamed(doc.documentElement, 'Score')
  if (!score) throw new Error('No <Score> element')
  const staves = childElements(score).filter(el => el.nodeName === 'Staff')
  if (staves.length !== 1) {
    throw new Error(`Expected exactly 1 music staff, found ${staves.length}`)
  }
  return staves[0]!
}

/** Splits a staff into sections at each title frame (VBox). */
export function extractSections(staff: Element): RawSection[] {
  const sections: RawSection[] = []
  let current: RawSection | null = null

  for (const el of childElements(staff)) {
    if (el.nodeName === 'VBox') {
      current = { texts: readFrameTexts(el), measures: [] }
      sections.push(current)
    } else if (el.nodeName === 'Measure') {
      if (!current) throw new Error('Found a measure before any title frame')
      current.measures.push(el)
    }
  }
  return sections
}

function readFrameTexts(vbox: Element): SectionText[] {
  return childElements(vbox)
    .filter(el => el.nodeName === 'Text')
    .map(el => {
      const textEl = firstChildNamed(el, 'text')
      return {
        style: textOf(el, 'style') ?? '',
        text: textEl ? frameText(textEl) : '',
      }
    })
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/import/sections.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 7: Commit**

```bash
git add scripts/import tests/import
git commit -m "feat: read .mscz archives and split scores into key sections"
```

---

### Task 5: Extract bars, notes, durations and lyrics

The golden test values below were read directly out of Lacie's file, so they are observed facts.

Corpus facts this task relies on: chord durations are only `half`/`quarter`/`eighth`; **rests are only ever `quarter`** (132 across the corpus, no whole-bar rests); lyric line number is a **child** `<no>` element, absent meaning line 0; `<syllabic>` is often absent and defaults to `single`.

**Files:**
- Create: `scripts/import/bars.ts`
- Test: `tests/import/bars.test.ts`

**Interfaces:**
- Consumes: `src/types.ts`, `scripts/import/dom.ts`
- Produces: `barsFromMeasures(measures: Element[]): Bar[]`

- [ ] **Step 1: Write the failing test**

`tests/import/bars.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readMscz } from '../../scripts/import/mscz'
import { musicStaff, extractSections } from '../../scripts/import/sections'
import { barsFromMeasures } from '../../scripts/import/bars'

const GOODNIGHT = 'source/G2 Melodies Level 1 (Goodnight, Sleep Tight).mscz'
const MO_LI_HUA = 'source/G2 Melodies Level 4 (Mo Lie Hua).mscz'
const BORDUNS = 'source/G2 - Bordun Techniques & No Lyrics.mscz'

function firstSectionBars(path: string) {
  const sections = extractSections(musicStaff(readMscz(path)))
  return barsFromMeasures(sections[0]!.measures)
}

describe('barsFromMeasures — Good Night, Sleep Tight in C (golden test)', () => {
  const bars = firstSectionBars(GOODNIGHT)
  const notes = bars.flatMap(b => b.notes)

  it('reads two bars totalling eleven notes', () => {
    expect(bars).toHaveLength(2)
    expect(notes).toHaveLength(11)
  })

  it('reads the exact pitches', () => {
    expect(notes.map(n => n.pitch)).toEqual([67, 64, 67, 64, 67, 67, 64, 64, 67, 67, 64])
  })

  it('reads four quarters, six eighths, then a quarter', () => {
    expect(notes.map(n => n.duration)).toEqual([
      'quarter', 'quarter', 'quarter', 'quarter',
      'eighth', 'eighth', 'eighth', 'eighth', 'eighth', 'eighth',
      'quarter',
    ])
  })

  it('reads one lyric syllable per note', () => {
    expect(notes.map(n => n.lyrics[0]!.text)).toEqual([
      'Good', 'night,', 'sleep', 'tight,',
      'friends', 'will', 'come', 'to', 'mor', 'row', 'night!',
    ])
  })

  it('marks the hyphenated word with syllabic positions', () => {
    expect(notes.slice(7, 10).map(n => n.lyrics[0]!.syllabic))
      .toEqual(['begin', 'middle', 'end'])
  })

  it('records tonal pitch class so spelling survives', () => {
    expect(notes[0]!.tpc).toBe(15)  // G natural
  })

  it('leaves melody notes without extra chord pitches', () => {
    expect(notes.every(n => n.extraPitches.length === 0)).toBe(true)
  })
})

describe('barsFromMeasures — other corpus shapes', () => {
  it('reads a second lyric line where one exists', () => {
    const notes = firstSectionBars(MO_LI_HUA).flatMap(b => b.notes)
    expect(notes[0]!.lyrics[0]!.text).toBe('好')
    expect(notes[0]!.lyrics[1]!.text).toBe('hǎo')
  })

  it('reads rests as notes with a null pitch', () => {
    const sections = extractSections(musicStaff(readMscz(BORDUNS)))
    const crossover = sections.find(s => s.texts[0]!.text === 'Crossover Bordun' && s.texts.length === 1)!
    const notes = barsFromMeasures(crossover.measures).flatMap(b => b.notes)
    expect(notes.at(-1)!.pitch).toBeNull()
    expect(notes.at(-1)!.duration).toBe('quarter')
  })

  it('reads a bordun dyad as a pitch plus extra pitches', () => {
    const sections = extractSections(musicStaff(readMscz(BORDUNS)))
    const chord = sections.find(s => s.texts[0]!.text === 'Chord Bordun')!
    const first = barsFromMeasures(chord.measures)[0]!.notes[0]!
    expect(first.pitch).toBe(72)             // C5
    expect(first.extraPitches).toEqual([79])  // G5
    expect(first.duration).toBe('half')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/import/bars.test.ts`
Expected: FAIL — cannot resolve `../../scripts/import/bars`

- [ ] **Step 3: Write `scripts/import/bars.ts`**

```ts
import type { Bar, Duration, LyricSyllable, Note } from '../../src/types'
import { DURATIONS } from '../../src/types'
import { childElements, firstChildNamed, textOf, frameText } from './dom'

export function barsFromMeasures(measures: Element[]): Bar[] {
  return measures.map(measure => ({ notes: notesFromMeasure(measure) }))
}

function notesFromMeasure(measure: Element): Note[] {
  const notes: Note[] = []
  for (const container of eventContainers(measure)) {
    for (const el of childElements(container)) {
      if (el.nodeName === 'Chord') notes.push(chordToNote(el))
      else if (el.nodeName === 'Rest') notes.push(restToNote(el))
    }
  }
  return notes
}

/** Measures wrap their events in <voice>; fall back to the measure itself. */
function eventContainers(measure: Element): Element[] {
  const voices = childElements(measure).filter(el => el.nodeName === 'voice')
  return voices.length > 0 ? voices : [measure]
}

function readDuration(el: Element): Duration {
  const raw = textOf(el, 'durationType')
  if (!raw || !(DURATIONS as readonly string[]).includes(raw)) {
    throw new Error(
      `Unsupported duration "${raw}". The songbook uses only ${DURATIONS.join(', ')}.`,
    )
  }
  return raw as Duration
}

function requireInt(el: Element, childName: string): number {
  const raw = textOf(el, childName)
  if (raw === null) throw new Error(`Missing <${childName}>`)
  const value = Number(raw)
  if (!Number.isInteger(value)) throw new Error(`<${childName}> is not an integer: "${raw}"`)
  return value
}

function chordToNote(chord: Element): Note {
  const noteEls = childElements(chord).filter(el => el.nodeName === 'Note')
  if (noteEls.length === 0) throw new Error('Found a <Chord> with no <Note> children')
  const pitches = noteEls.map(el => requireInt(el, 'pitch'))
  return {
    pitch: pitches[0]!,
    tpc: requireInt(noteEls[0]!, 'tpc'),
    extraPitches: pitches.slice(1),
    duration: readDuration(chord),
    lyrics: readLyrics(chord),
  }
}

function restToNote(rest: Element): Note {
  return {
    pitch: null,
    tpc: null,
    extraPitches: [],
    duration: readDuration(rest),
    lyrics: [],
  }
}

const SYLLABIC_VALUES: LyricSyllable['syllabic'][] = ['single', 'begin', 'middle', 'end']

function readLyrics(chord: Element): LyricSyllable[] {
  const byLine: LyricSyllable[] = []
  for (const el of childElements(chord).filter(e => e.nodeName === 'Lyrics')) {
    const line = Number(textOf(el, 'no') ?? '0')
    const textEl = firstChildNamed(el, 'text')
    const syllabic = textOf(el, 'syllabic') ?? 'single'
    if (!SYLLABIC_VALUES.includes(syllabic as LyricSyllable['syllabic'])) {
      throw new Error(`Unsupported <syllabic> value "${syllabic}"`)
    }
    byLine[line] = {
      text: textEl ? frameText(textEl) : '',
      syllabic: syllabic as LyricSyllable['syllabic'],
    }
  }
  // Fill any gap so consumers can index lines without holes.
  return Array.from(byLine, line => line ?? { text: '', syllabic: 'single' as const })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/import/bars.test.ts`
Expected: PASS, 10 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/import/bars.ts tests/import/bars.test.ts
git commit -m "feat: extract bars, notes, durations and lyrics from MuseScore measures"
```

---

### Task 6: Assemble a Song from its four sections

**Title comes from the frame, not the filename.** `G2 Melodies Level 3 (Old Macdonald).mscz` is actually titled *"ECE Has a Music Room"*, and that file carries no `LEVEL n:` heading at all. So: **title = the second-to-last text in the first frame; key label = the last text in every frame; level = from the filename.**

System breaks are computed, since the corpus contains no `line` layout breaks. The rule reproduces the book: songs of 2 bars stay on one line; longer songs split in half.

**Files:**
- Create: `scripts/import/song.ts`, `scripts/import/systems.ts`
- Test: `tests/import/song.test.ts`

**Interfaces:**
- Consumes: `src/types.ts`, `scripts/import/sections.ts`, `scripts/import/bars.ts`
- Produces: `systemBreaksFor(barCount: number): number[]`, `slugify(title: string): string`, `levelFromFilename(path: string): 1|2|3|4`, `buildSong(path: string): Song`

- [ ] **Step 1: Write the failing test**

`tests/import/song.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildSong, slugify, levelFromFilename } from '../../scripts/import/song'
import { systemBreaksFor } from '../../scripts/import/systems'

const GOODNIGHT = 'source/G2 Melodies Level 1 (Goodnight, Sleep Tight).mscz'
const OLD_MACDONALD = 'source/G2 Melodies Level 3 (Old Macdonald).mscz'
const MO_LI_HUA = 'source/G2 Melodies Level 4 (Mo Lie Hua).mscz'

describe('systemBreaksFor', () => {
  it('keeps a two-bar song on one line', () => {
    expect(systemBreaksFor(2)).toEqual([])
  })
  it('splits a four-bar song into two lines of two', () => {
    expect(systemBreaksFor(4)).toEqual([2])
  })
  it('splits an eight-bar song into two lines of four', () => {
    expect(systemBreaksFor(8)).toEqual([4])
  })
})

describe('slugify', () => {
  it('makes a URL-safe id', () => {
    expect(slugify('Good Night, Sleep Tight')).toBe('good-night-sleep-tight')
    expect(slugify("I'm an Acorn")).toBe('im-an-acorn')
    expect(slugify('Mò Lì Huā 茉莉花')).toBe('mo-li-hua')
  })
})

describe('levelFromFilename', () => {
  it('reads the level from the file name', () => {
    expect(levelFromFilename(GOODNIGHT)).toBe(1)
    expect(levelFromFilename(MO_LI_HUA)).toBe(4)
  })
})

describe('buildSong', () => {
  it('assembles all four keys', () => {
    const song = buildSong(GOODNIGHT)
    expect(Object.keys(song.keys)).toEqual(['C', 'D', 'F', 'G'])
    expect(song.keys.C.label).toBe('GE')
    expect(song.keys.D.label).toBe('AF#')
    expect(song.keys.F.label).toBe('CA')
    expect(song.keys.G.label).toBe('DB')
  })

  it('takes the title from the frame and the level from the filename', () => {
    const song = buildSong(OLD_MACDONALD)
    expect(song.title).toBe('ECE Has a Music Room')
    expect(song.level).toBe(3)
    expect(song.id).toBe('ece-has-a-music-room')
  })

  it('strips the LEVEL heading from the title', () => {
    expect(buildSong(GOODNIGHT).title).toBe('Good Night, Sleep Tight')
  })

  it('gives every key the same bar count', () => {
    const song = buildSong(MO_LI_HUA)
    const counts = Object.values(song.keys).map(k => k.bars.length)
    expect(counts).toEqual([8, 8, 8, 8])
  })

  it('computes system breaks per key', () => {
    expect(buildSong(MO_LI_HUA).keys.C.systemBreaks).toEqual([4])
    expect(buildSong(GOODNIGHT).keys.C.systemBreaks).toEqual([])
  })

  it('transposes the four sections by +2, +5 and +7 semitones', () => {
    const song = buildSong(GOODNIGHT)
    const firstPitch = (key: 'C' | 'D' | 'F' | 'G') => song.keys[key].bars[0]!.notes[0]!.pitch
    expect(firstPitch('C')).toBe(67)
    expect(firstPitch('D')).toBe(69)
    expect(firstPitch('F')).toBe(72)
    expect(firstPitch('G')).toBe(74)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/import/song.test.ts`
Expected: FAIL — cannot resolve `../../scripts/import/song`

- [ ] **Step 3: Write `scripts/import/systems.ts`**

```ts
/**
 * The corpus contains no `line` layout breaks, so line breaking is ours to decide.
 * This rule reproduces the printed book exactly: 2-bar songs on one line, 4-bar
 * songs as two lines of two, 8-bar songs as two lines of four.
 */
export function systemBreaksFor(barCount: number): number[] {
  if (barCount <= 2) return []
  return [Math.ceil(barCount / 2)]
}
```

- [ ] **Step 4: Write `scripts/import/song.ts`**

```ts
import { basename } from 'node:path'
import type { KeyName, KeyVersion, Song } from '../../src/types'
import { KEY_NAMES } from '../../src/types'
import { readMscz } from './mscz'
import { musicStaff, extractSections } from './sections'
import { barsFromMeasures } from './bars'
import { systemBreaksFor } from './systems'

export function slugify(title: string): string {
  return title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')                 // strip combining diacritics
    .replace(/[^\p{ASCII}]/gu, '')          // drop non-ASCII (e.g. 茉莉花)
    .toLowerCase()
    .replace(/['’]/g, '')                   // I'm -> im
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function levelFromFilename(path: string): 1 | 2 | 3 | 4 {
  const match = /Level (\d)/.exec(basename(path))
  if (!match) throw new Error(`No "Level n" in filename: ${basename(path)}`)
  const level = Number(match[1])
  if (level !== 1 && level !== 2 && level !== 3 && level !== 4) {
    throw new Error(`Level ${level} is outside 1-4 in ${basename(path)}`)
  }
  return level
}

export function buildSong(path: string): Song {
  const sections = extractSections(musicStaff(readMscz(path)))
  if (sections.length !== KEY_NAMES.length) {
    throw new Error(
      `${basename(path)}: expected ${KEY_NAMES.length} key sections, found ${sections.length}`,
    )
  }

  // The last text in a frame is the key label; the one before it is the song title.
  const firstTexts = sections[0]!.texts
  if (firstTexts.length < 2) {
    throw new Error(`${basename(path)}: first frame has no title above its key label`)
  }
  const title = firstTexts[firstTexts.length - 2]!.text

  const keys = {} as Record<KeyName, KeyVersion>
  KEY_NAMES.forEach((keyName, index) => {
    const section = sections[index]!
    const bars = barsFromMeasures(section.measures)
    keys[keyName] = {
      label: section.texts.at(-1)!.text,
      bars,
      systemBreaks: systemBreaksFor(bars.length),
    }
  })

  const barCounts = KEY_NAMES.map(k => keys[k].bars.length)
  if (new Set(barCounts).size !== 1) {
    throw new Error(`${basename(path)}: key sections differ in length: ${barCounts.join(', ')}`)
  }

  return {
    id: slugify(title),
    title,
    level: levelFromFilename(path),
    timeSignature: [4, 4],
    keys,
    defaultTempo: 100,
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/import/song.test.ts`
Expected: PASS, 11 tests

- [ ] **Step 6: Commit**

```bash
git add scripts/import/song.ts scripts/import/systems.ts tests/import/song.test.ts
git commit -m "feat: assemble Song records from the four authored key sections"
```

---

### Task 7: Import the five bordun patterns

The canonical file `G2 - Bordun Techniques & No Lyrics.mscz` holds 20 title frames — 5 patterns × 4 keys. **The file's order differs from the printed page order**, so patterns are matched by title text and keys are derived from the tonic pitch, never from position.

Hand assignments are not in the MuseScore files and must be authored. The values below are the obvious reading and are **marked provisional pending Lacie's confirmation**; the test asserts structural correctness only.

**Files:**
- Create: `scripts/import/bordun.ts`, `src/data/bordunHands.ts`
- Test: `tests/import/bordun.test.ts`

**Interfaces:**
- Consumes: `src/types.ts`, `scripts/import/sections.ts`, `scripts/import/bars.ts`, `src/music/pitch.ts`
- Produces: `BORDUN_HANDS: Record<BordunId, ('L'|'R'|'both')[]>`, `buildBorduns(path: string): Bordun[]`

- [ ] **Step 1: Write `src/data/bordunHands.ts`**

```ts
import type { BordunId } from '../types'

/**
 * PROVISIONAL — confirm with Lacie before the app ships.
 *
 * Hand assignment per event in the one-bar pattern. The five borduns are hand-technique
 * lessons, so the bottom xylophone shows left and right correctly rather than just pitches.
 *   chord / levels  — both hands strike together
 *   broken          — hands alternate
 *   crossover       — the right hand crosses over the left to reach the upper tonic
 */
export const BORDUN_HANDS: Record<BordunId, ('L' | 'R' | 'both')[]> = {
  chord: ['both', 'both'],
  levels: ['both', 'both'],
  broken: ['L', 'R', 'L', 'R'],
  crossover: ['L', 'R', 'R', 'R'],
  'crossover-challenge': ['L', 'R', 'R', 'R'],
}
```

- [ ] **Step 2: Write the failing test**

`tests/import/bordun.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildBorduns } from '../../scripts/import/bordun'
import { BORDUN_HANDS } from '../../src/data/bordunHands'

const BORDUNS = 'source/G2 - Bordun Techniques & No Lyrics.mscz'
const borduns = buildBorduns(BORDUNS)
const byId = Object.fromEntries(borduns.map(b => [b.id, b]))

describe('buildBorduns', () => {
  it('finds all five patterns', () => {
    expect(borduns.map(b => b.id).sort()).toEqual(
      ['broken', 'chord', 'crossover', 'crossover-challenge', 'levels'],
    )
  })

  it('gives every pattern all four keys', () => {
    for (const bordun of borduns) {
      expect(Object.keys(bordun.keys)).toEqual(['C', 'D', 'F', 'G'])
    }
  })

  it('reads the chord bordun as two dyads of tonic plus fifth', () => {
    expect(byId.chord!.keys.C).toEqual([
      { beat: 0, pitches: [72, 79], duration: 'half', hand: 'both' },
      { beat: 2, pitches: [72, 79], duration: 'half', hand: 'both' },
    ])
  })

  it('reads the broken bordun as four alternating quarters', () => {
    expect(byId.broken!.keys.C.map(e => e.pitches)).toEqual([[72], [79], [72], [79]])
    expect(byId.broken!.keys.C.map(e => e.beat)).toEqual([0, 1, 2, 3])
  })

  it('reads the levels bordun as a low dyad then the octave above', () => {
    expect(byId.levels!.keys.C.map(e => e.pitches)).toEqual([[72, 79], [84, 91]])
  })

  it('reads the crossover bordun with its closing rest', () => {
    expect(byId.crossover!.keys.C.map(e => e.pitches)).toEqual([[72], [79], [84], []])
  })

  it('distinguishes the challenge crossover by its subtitle', () => {
    expect(byId['crossover-challenge']!.isChallenge).toBe(true)
    expect(byId.crossover!.isChallenge).toBe(false)
    expect(byId['crossover-challenge']!.keys.C.map(e => e.pitches))
      .toEqual([[72], [79], [84], [79]])
  })

  it('assigns keys from the tonic rather than file order', () => {
    expect(byId.chord!.keys.D.map(e => e.pitches)).toEqual([[74, 81], [74, 81]])
    expect(byId.chord!.keys.F.map(e => e.pitches)).toEqual([[77, 84], [77, 84]])
    expect(byId.chord!.keys.G.map(e => e.pitches)).toEqual([[79, 86], [79, 86]])
  })

  it('gives every event a hand, one per event in the pattern', () => {
    for (const bordun of borduns) {
      for (const events of Object.values(bordun.keys)) {
        expect(events).toHaveLength(BORDUN_HANDS[bordun.id].length)
        expect(events.every(e => ['L', 'R', 'both'].includes(e.hand))).toBe(true)
      }
    }
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/import/bordun.test.ts`
Expected: FAIL — cannot resolve `../../scripts/import/bordun`

- [ ] **Step 4: Write `scripts/import/bordun.ts`**

```ts
import { basename } from 'node:path'
import type { Bordun, BordunEvent, BordunId, KeyName } from '../../src/types'
import { DURATION_TICKS, KEY_NAMES, TICKS_PER_QUARTER } from '../../src/types'
import { pitchClass } from '../../src/music/pitch'
import { BORDUN_HANDS } from '../../src/data/bordunHands'
import { readMscz } from './mscz'
import { musicStaff, extractSections } from './sections'
import { barsFromMeasures } from './bars'

/** Four distinct frame titles, but "Crossover Bordun" yields two ids, so five patterns. */
const PATTERN_COUNT = 5

const PATTERN_IDS: Record<string, BordunId> = {
  'Chord Bordun': 'chord',
  'Broken Bordun': 'broken',
  'Levels Bordun': 'levels',
  'Crossover Bordun': 'crossover',
}

/** Tonic pitch class of each songbook key. */
const KEY_BY_TONIC: Record<number, KeyName> = { 0: 'C', 2: 'D', 5: 'F', 7: 'G' }

export function buildBorduns(path: string): Bordun[] {
  const sections = extractSections(musicStaff(readMscz(path)))
  const expected = PATTERN_COUNT * KEY_NAMES.length
  if (sections.length !== expected) {
    throw new Error(`${basename(path)}: expected ${expected} bordun frames, found ${sections.length}`)
  }

  const collected = new Map<BordunId, Partial<Record<KeyName, BordunEvent[]>>>()
  const labels = new Map<BordunId, string>()

  for (const section of sections) {
    // The title frame carries the pattern name; a "*CHALLENGE*" subtitle marks the variant.
    const title = section.texts[0]!.text
    const isChallenge = section.texts.some(t => t.text.includes('CHALLENGE'))
    const base = PATTERN_IDS[title]
    if (!base) throw new Error(`Unrecognised bordun pattern title "${title}"`)
    const id: BordunId = isChallenge ? 'crossover-challenge' : base

    const bars = barsFromMeasures(section.measures)
    if (bars.length !== 1) {
      throw new Error(`Bordun "${title}" should be one bar, found ${bars.length}`)
    }

    const hands = BORDUN_HANDS[id]
    const events: BordunEvent[] = []
    let ticks = 0
    bars[0]!.notes.forEach((note, index) => {
      const hand = hands[index]
      if (!hand) throw new Error(`No hand assigned for event ${index} of bordun "${id}"`)
      events.push({
        beat: ticks / TICKS_PER_QUARTER,
        pitches: note.pitch === null ? [] : [note.pitch, ...note.extraPitches],
        duration: note.duration,
        hand,
      })
      ticks += DURATION_TICKS[note.duration]
    })

    const tonic = events.find(e => e.pitches.length > 0)?.pitches[0]
    if (tonic === undefined) throw new Error(`Bordun "${title}" has no sounding note`)
    const keyName = KEY_BY_TONIC[pitchClass(tonic)]
    if (!keyName) {
      throw new Error(`Bordun "${title}" is in an unexpected key (tonic pitch class ${pitchClass(tonic)})`)
    }

    if (!collected.has(id)) collected.set(id, {})
    collected.get(id)![keyName] = events
    labels.set(id, isChallenge ? `${title} *CHALLENGE*` : title)
  }

  return [...collected.entries()].map(([id, keys]) => {
    for (const keyName of KEY_NAMES) {
      if (!keys[keyName]) throw new Error(`Bordun "${id}" is missing the key of ${keyName}`)
    }
    return {
      id,
      label: labels.get(id)!,
      isChallenge: id === 'crossover-challenge',
      keys: keys as Record<KeyName, BordunEvent[]>,
    }
  })
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/import/bordun.test.ts`
Expected: PASS, 9 tests

- [ ] **Step 6: Commit**

```bash
git add scripts/import/bordun.ts src/data/bordunHands.ts tests/import/bordun.test.ts
git commit -m "feat: import the five bordun patterns, keyed by title and tonic"
```

---

### Task 8: Corpus validation and the import CLI

Every check below currently passes on all 21 files. They exist to fail the build if a future MuseScore edit breaks an assumption the renderer depends on.

**Files:**
- Create: `scripts/import/validate.ts`, `scripts/import/index.ts`
- Create (generated, committed): `src/data/songs.json`, `src/data/borduns.json`
- Test: `tests/import/validate.test.ts`

**Interfaces:**
- Consumes: everything above
- Produces: `validateDocument(doc: Document, label: string): void`, `validateBars(bars: Bar[], label: string): void`, `sourceFiles(): string[]`

- [ ] **Step 1: Write the failing test**

`tests/import/validate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readMscz } from '../../scripts/import/mscz'
import { musicStaff, extractSections } from '../../scripts/import/sections'
import { barsFromMeasures } from '../../scripts/import/bars'
import { validateDocument, validateBars, sourceFiles, songFiles } from '../../scripts/import/validate'

describe('source discovery', () => {
  it('finds 21 files and ignores _superseded', () => {
    const files = sourceFiles()
    expect(files).toHaveLength(21)
    expect(files.every(f => !f.includes('_superseded'))).toBe(true)
  })

  it('separates the 19 song files from the bordun files', () => {
    expect(songFiles()).toHaveLength(19)
  })
})

describe('corpus invariants hold across every file', () => {
  for (const file of sourceFiles()) {
    it(`validates ${file}`, () => {
      const doc = readMscz(file)
      expect(() => validateDocument(doc, file)).not.toThrow()
      for (const section of extractSections(musicStaff(doc))) {
        expect(() => validateBars(barsFromMeasures(section.measures), file)).not.toThrow()
      }
    })
  }
})

describe('validateBars', () => {
  it('rejects a bar that does not fill 4/4', () => {
    const short = [{ notes: [{ pitch: 60, tpc: 14, extraPitches: [], duration: 'quarter' as const, lyrics: [] }] }]
    expect(() => validateBars(short, 'test')).toThrow(/does not fill a 4\/4 bar/)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/import/validate.test.ts`
Expected: FAIL — cannot resolve `../../scripts/import/validate`

- [ ] **Step 3: Write `scripts/import/validate.ts`**

```ts
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Bar } from '../../src/types'
import { DURATION_TICKS, TICKS_PER_BAR } from '../../src/types'
import { PITCH_COLOURS } from '../../src/music/colours'
import { pitchClass } from '../../src/music/pitch'
import { childElements, firstChildNamed, textOf } from './dom'

const SOURCE_DIR = 'source'

export function sourceFiles(): string[] {
  return readdirSync(SOURCE_DIR)
    .filter(name => name.endsWith('.mscz'))
    .sort()
    .map(name => join(SOURCE_DIR, name))
}

export function songFiles(): string[] {
  return sourceFiles().filter(path => !path.includes('Bordun'))
}

export function bordunFile(): string {
  return join(SOURCE_DIR, 'G2 - Bordun Techniques & No Lyrics.mscz')
}

/** Elements the renderer cannot draw. None appear in the corpus today. */
const FORBIDDEN_ELEMENTS = ['Tie', 'Slur', 'Volta', 'Jump', 'Marker', 'Tuplet', 'dots']

export function validateDocument(doc: Document, label: string): void {
  const score = firstChildNamed(doc.documentElement, 'Score')
  if (!score) throw new Error(`${label}: no <Score>`)

  const parts = childElements(score).filter(el => el.nodeName === 'Part')
  if (parts.length !== 1) throw new Error(`${label}: expected 1 Part, found ${parts.length}`)

  const timeSigs = doc.getElementsByTagName('TimeSig')
  for (let i = 0; i < timeSigs.length; i++) {
    const sig = timeSigs[i] as unknown as Element
    const n = textOf(sig, 'sigN')
    const d = textOf(sig, 'sigD')
    if (n !== '4' || d !== '4') throw new Error(`${label}: time signature ${n}/${d}, expected 4/4`)
  }

  for (const tag of FORBIDDEN_ELEMENTS) {
    if (doc.getElementsByTagName(tag).length > 0) {
      throw new Error(`${label}: contains <${tag}>, which the renderer cannot draw`)
    }
  }

  const notes = doc.getElementsByTagName('Note')
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i] as unknown as Element
    const pitch = Number(textOf(note, 'pitch'))
    const colour = firstChildNamed(note, 'color')
    if (!colour) throw new Error(`${label}: a note has no <color>`)
    const actual = [
      Number(colour.getAttribute('r')),
      Number(colour.getAttribute('g')),
      Number(colour.getAttribute('b')),
    ]
    const expected = PITCH_COLOURS[pitchClass(pitch)]
    if (!expected) throw new Error(`${label}: no colour defined for pitch ${pitch}`)
    if (actual.join(',') !== expected.join(',')) {
      throw new Error(
        `${label}: pitch ${pitch} is coloured ${actual.join(',')} but the table says ${expected.join(',')}`,
      )
    }
  }
}

export function validateBars(bars: Bar[], label: string): void {
  bars.forEach((bar, index) => {
    const ticks = bar.notes.reduce((sum, note) => sum + DURATION_TICKS[note.duration], 0)
    if (ticks !== TICKS_PER_BAR) {
      throw new Error(
        `${label}: bar ${index + 1} does not fill a 4/4 bar (${ticks} of ${TICKS_PER_BAR} ticks)`,
      )
    }
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/import/validate.test.ts`
Expected: PASS — 2 discovery tests, 21 per-file tests, 1 negative test

- [ ] **Step 5: Write `scripts/import/index.ts`**

```ts
import { writeFileSync, mkdirSync } from 'node:fs'
import { readMscz } from './mscz'
import { musicStaff, extractSections } from './sections'
import { barsFromMeasures } from './bars'
import { buildSong } from './song'
import { buildBorduns } from './bordun'
import { validateDocument, validateBars, songFiles, bordunFile } from './validate'

const OUT_DIR = 'src/data'

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true })

  const songs = songFiles().map(path => {
    const doc = readMscz(path)
    validateDocument(doc, path)
    for (const section of extractSections(musicStaff(doc))) {
      validateBars(barsFromMeasures(section.measures), path)
    }
    return buildSong(path)
  })

  const bordunPath = bordunFile()
  validateDocument(readMscz(bordunPath), bordunPath)
  const borduns = buildBorduns(bordunPath)

  const ids = songs.map(s => s.id)
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i)
  if (duplicates.length > 0) throw new Error(`Duplicate song ids: ${duplicates.join(', ')}`)

  writeFileSync(`${OUT_DIR}/songs.json`, JSON.stringify(songs, null, 2) + '\n')
  writeFileSync(`${OUT_DIR}/borduns.json`, JSON.stringify(borduns, null, 2) + '\n')

  console.log(`Imported ${songs.length} songs and ${borduns.length} borduns.`)
  for (const song of songs) {
    console.log(`  L${song.level}  ${song.id.padEnd(28)} ${song.keys.C.bars.length} bars`)
  }
}

main()
```

- [ ] **Step 6: Run the importer and inspect the output**

Run: `npm run import`
Expected: `Imported 19 songs and 5 borduns.` followed by 19 lines. If any file fails validation, fix the importer — do **not** weaken the check without confirming with David first.

- [ ] **Step 7: Commit**

```bash
git add scripts/import/validate.ts scripts/import/index.ts tests/import/validate.test.ts src/data/songs.json src/data/borduns.json
git commit -m "feat: corpus validation and import CLI; generate songs.json and borduns.json"
```

---

### Task 9: Prove the four authored keys agree with each other

The spec's transposition rules become a *validation test*: regenerating keys D, F and G from key C must reproduce what Lacie authored, note for note. This is what catches a mis-split section — the one failure mode that could silently corrupt a song.

**Files:**
- Create: `src/music/transpose.ts`
- Test: `tests/music/transpose.test.ts`

**Interfaces:**
- Consumes: `src/types.ts`, `src/music/pitch.ts`
- Produces: `KEY_TRANSPOSITIONS: Record<KeyName, { semitones: number; tpcShift: number }>`, `transposeNote(note: Note, semitones: number, tpcShift: number): Note`, `transposeBars(bars: Bar[], semitones: number, tpcShift: number): Bar[]`

- [ ] **Step 1: Write the failing test**

`tests/music/transpose.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import songs from '../../src/data/songs.json'
import type { Song, KeyName } from '../../src/types'
import { KEY_NAMES } from '../../src/types'
import { KEY_TRANSPOSITIONS, transposeBars } from '../../src/music/transpose'
import { spelledName } from '../../src/music/pitch'

const ALL = songs as unknown as Song[]

describe('key transposition rules', () => {
  it('moves up a tone, a fourth and a fifth', () => {
    expect(KEY_TRANSPOSITIONS.C).toEqual({ semitones: 0, tpcShift: 0 })
    expect(KEY_TRANSPOSITIONS.D).toEqual({ semitones: 2, tpcShift: 2 })
    expect(KEY_TRANSPOSITIONS.F).toEqual({ semitones: 5, tpcShift: -1 })
    expect(KEY_TRANSPOSITIONS.G).toEqual({ semitones: 7, tpcShift: 1 })
  })
})

describe('the authored keys agree with the transposition rules', () => {
  for (const song of ALL) {
    for (const key of KEY_NAMES) {
      it(`${song.id} — key of ${key} matches key of C transposed`, () => {
        const { semitones, tpcShift } = KEY_TRANSPOSITIONS[key as KeyName]
        expect(transposeBars(song.keys.C.bars, semitones, tpcShift)).toEqual(song.keys[key].bars)
      })
    }
  }
})

describe('spelling survives transposition', () => {
  it('spells the D-key version of a C-key F as F sharp, never G flat', () => {
    const goodnight = ALL.find(s => s.id === 'good-night-sleep-tight')!
    const names = goodnight.keys.D.bars
      .flatMap(b => b.notes)
      .filter(n => n.tpc !== null)
      .map(n => spelledName(n.tpc!))
    expect(names).toContain('F#')
    expect(names).not.toContain('Gb')
  })
})

describe('every song uses only the notes its key label sets out', () => {
  for (const song of ALL) {
    for (const key of KEY_NAMES) {
      it(`${song.id} — ${key} notes are within its labelled bars`, () => {
        const version = song.keys[key as KeyName]
        const labelled = new Set(version.label.match(/[A-G]#?/g) ?? [])
        const used = new Set(
          version.bars.flatMap(b => b.notes).filter(n => n.tpc !== null)
            .map(n => spelledName(n.tpc!)),
        )
        for (const note of used) expect(labelled).toContain(note)
      })
    }
  }
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/music/transpose.test.ts`
Expected: FAIL — cannot resolve `../../src/music/transpose`

- [ ] **Step 3: Write `src/music/transpose.ts`**

```ts
import type { Bar, KeyName, Note } from '../types'

/**
 * Moving up a tone is +2 steps on the circle of fifths; up a fourth is −1; up a fifth is +1.
 * Shifting the tonal pitch class alongside the MIDI pitch is what keeps F# spelled as a
 * sharpened F rather than a flattened G.
 */
export const KEY_TRANSPOSITIONS: Record<KeyName, { semitones: number; tpcShift: number }> = {
  C: { semitones: 0, tpcShift: 0 },
  D: { semitones: 2, tpcShift: 2 },
  F: { semitones: 5, tpcShift: -1 },
  G: { semitones: 7, tpcShift: 1 },
}

export function transposeNote(note: Note, semitones: number, tpcShift: number): Note {
  return {
    ...note,
    pitch: note.pitch === null ? null : note.pitch + semitones,
    tpc: note.tpc === null ? null : note.tpc + tpcShift,
    extraPitches: note.extraPitches.map(p => p + semitones),
  }
}

export function transposeBars(bars: Bar[], semitones: number, tpcShift: number): Bar[] {
  return bars.map(bar => ({ notes: bar.notes.map(n => transposeNote(n, semitones, tpcShift)) }))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/music/transpose.test.ts`
Expected: PASS — 1 rules test, 76 per-song-per-key agreement tests, 1 spelling test, 76 label-subset tests.

If a `key of X matches key of C transposed` test fails, the section split is wrong or Lacie's file has an inconsistency — investigate the file before changing the test. If a label-subset test fails, report the song to David rather than editing the label; the labels are Lacie's teaching notation.

- [ ] **Step 5: Commit**

```bash
git add src/music/transpose.ts tests/music/transpose.test.ts
git commit -m "test: prove the four authored keys agree with the transposition rules"
```

---

### Task 10: Phrase letters for all 19 songs

The A/B phrase boxes are the one part of the page that exists in no MuseScore file — they were drawn in Word. They must be read off the printed book.

The colour of a box encodes phrase *identity*: same letter means the same musical phrase, and the renderer derives the colour from the letter so identical phrases always match.

**Files:**
- Create: `src/data/phrases.ts`
- Test: `tests/data/phrases.test.ts`

**Interfaces:**
- Consumes: `src/types.ts`, `src/data/songs.json`
- Produces: `PHRASES: Record<string, { letters: string[]; grouping?: number[] }>`

- [ ] **Step 1: Read the phrase structure off the PDF**

Open `reference/G2 Songbooks Separate (Levels 1-2 & Levels 3-4).pdf`. For each of the 19 songs, look at **one page only** — the first key version — since the boxes are identical across all four keys.

For each song record two things:
1. **`letters`** — one letter per box, left to right, top to bottom. Boxes sharing a colour share a letter. First distinct phrase is `A`, next new one `B`, and so on.
2. **`grouping`** — how many bars each box spans. Omit it entirely when every box covers exactly one bar.

Three worked examples, already read from the book:

| Song | Boxes | `letters` | `grouping` |
|---|---|---|---|
| Good Night, Sleep Tight | red, green | `['A','B']` | omit (1 bar each) |
| Frog in the Meadow | red, green, purple, green | `['A','B','C','B']` | omit (1 bar each) |
| Mò Lì Huā | red, red, green, purple | `['A','A','B','C']` | `[2,2,2,2]` |

- [ ] **Step 2: Write the failing test**

`tests/data/phrases.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import songs from '../../src/data/songs.json'
import type { Song } from '../../src/types'
import { PHRASES } from '../../src/data/phrases'

const ALL = songs as unknown as Song[]

describe('phrase data', () => {
  it('covers every imported song and nothing else', () => {
    expect(Object.keys(PHRASES).sort()).toEqual(ALL.map(s => s.id).sort())
  })

  it('matches the known songs read off the book', () => {
    expect(PHRASES['good-night-sleep-tight']!.letters).toEqual(['A', 'B'])
    expect(PHRASES['frog-in-the-meadow']!.letters).toEqual(['A', 'B', 'C', 'B'])
    expect(PHRASES['mo-li-hua']!.letters).toEqual(['A', 'A', 'B', 'C'])
    expect(PHRASES['mo-li-hua']!.grouping).toEqual([2, 2, 2, 2])
  })

  for (const song of ALL) {
    it(`${song.id} — boxes account for every bar`, () => {
      const entry = PHRASES[song.id]!
      const grouping = entry.grouping ?? entry.letters.map(() => 1)
      expect(grouping).toHaveLength(entry.letters.length)
      const bars = song.keys.C.bars.length
      expect(grouping.reduce((a, b) => a + b, 0)).toBe(bars)
    })

    it(`${song.id} — letters start at A with no gaps`, () => {
      const distinct = [...new Set(PHRASES[song.id]!.letters)].sort()
      const expected = distinct.map((_, i) => String.fromCharCode(65 + i))
      expect(distinct).toEqual(expected)
    })
  }
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/data/phrases.test.ts`
Expected: FAIL — cannot resolve `../../src/data/phrases`

- [ ] **Step 4: Write `src/data/phrases.ts`**

Record every song using the shape below. The three known entries are given; fill the remaining sixteen from Step 1. Song ids come from `src/data/songs.json` — read them from there rather than guessing at slugs.

```ts
/**
 * Phrase boxes, read off the printed songbook — they exist in no MuseScore file.
 * `letters` is one entry per box, left to right; boxes sharing a letter are the same
 * musical phrase and are drawn in the same colour. `grouping` is bars per box, omitted
 * when every box covers exactly one bar.
 */
export interface PhraseEntry {
  letters: string[]
  grouping?: number[]
}

export const PHRASES: Record<string, PhraseEntry> = {
  'good-night-sleep-tight': { letters: ['A', 'B'] },
  'frog-in-the-meadow': { letters: ['A', 'B', 'C', 'B'] },
  'mo-li-hua': { letters: ['A', 'A', 'B', 'C'], grouping: [2, 2, 2, 2] },
  // The remaining 16 entries, in the same shape, one per song id in songs.json.
}
```

These sixteen entries are **transcription, not invention**: the boxes exist only as drawn
rectangles on the PDF pages, so they have to be read off the book in Step 1. Nothing else in
this plan can supply them. The tests in Step 2 catch every mechanical error — a missing song,
a miscounted bar span, a letter sequence that skips a letter — so work through the pages and
let the suite check you.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/data/phrases.test.ts`
Expected: PASS — 2 fixed tests plus 38 per-song checks

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: every test passes. This is the gate for the data pipeline being complete.

- [ ] **Step 7: Commit**

```bash
git add src/data/phrases.ts tests/data/phrases.test.ts
git commit -m "feat: phrase box letters for all 19 songs, read from the printed book"
```

---

## What Plan 2 covers

The data pipeline ends here with validated JSON and a green suite. The app is a separate plan, written once this one has run so its rendering tasks can cite real imported data rather than assumed shapes:

1. Schedule builder — pure `(song, key, bordun, tempo, repeats) → TimedEvent[]`, count-in, repeats, the −24 bordun shift
2. Notation renderer — VexFlow scaffolding, coloured letter noteheads, explicit per-note accidentals, two-line lyrics, phrase boxes
3. Xylophone component — SVG bars, raised F♯, dimmed out-of-key bars, two mallets
4. Audio engine — Tone sampler and transport, sourced glockenspiel samples
5. Transport clock — `requestAnimationFrame` read-back driving the cursor
6. App shell — controls, song picker, keyboard shortcuts
7. PWA offline caching and Vercel deployment
