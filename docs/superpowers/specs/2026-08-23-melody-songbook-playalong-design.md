# Melody Songbook Play-Along — Design

**Date:** 2026-08-23
**Status:** Approved design, ready for implementation planning
**Author:** David Rempel (concept by Lacie)

---

## Purpose

A classroom play-along for Lacie's *Melody Songbook* (Levels 1–4). Projected at the
front of the room, it plays a song at a chosen tempo while a cursor follows the
notation note by note, a top xylophone shows the melody being played, and a bottom
xylophone shows the selected bordun accompaniment.

The teaching pattern it serves: the class splits in two. Half play the melody, half
play the bordun. The screen shows both parts at once, from the student's viewpoint.

This is **not** a general music app. Every decision follows the songbook.

## Success criteria

1. Any song in the book plays back in any of the four keys with a visually accurate,
   in-time cursor and note highlighting.
2. Both xylophones show the correct bars lighting up, struck by correctly-handed mallets.
3. The page looks like the printed songbook: coloured letter-noteheads, coloured
   phrase boxes, lyrics under the notes.
4. Tempo, key, bordun, repeat count and per-part muting are all changeable mid-lesson
   without leaving the screen.
5. Works with the wifi down, once loaded.

## Non-goals

- Student accounts, progress tracking, scoring, recording, or any input from students.
- Editing or creating songs in the app. Songs come from MuseScore.
- Printing. The PDF already does that job.
- Mobile or tablet layouts. Projector only.

---

## Source material

78-page PDF, containing two songbooks (Levels 1–2, Levels 3–4). Structure is
2 cover pages + 76 song pages = **19 songs × 4 keys**.

The PDF has **no text layer** — every page is a flat image. It is a reference for
appearance only; no data is extracted from it.

MuseScore sources exist for all songs **and** for the borduns.

### What the MuseScore files contain

Verified by unzipping `Melodies Level 1 (Goodnight, Sleep Tight).mscz` (MuseScore 4.5.2)
and parsing the `.mscx` inside:

- MIDI pitch per note (`<pitch>`) and tonal pitch class (`<tpc>`, giving spelling)
- Duration (`<durationType>`)
- Lyric syllable with `<syllabic>` position
- **Note colour** — e.g. G is `rgb(0,156,149)`, E is `rgb(255,243,43)`
- `<headScheme>name-pitch</headScheme>` — the letter-in-notehead scheme
- Title, subtitle, key label, time signature, key signature

### What they do NOT contain

- The coloured phrase boxes (A/B sections) — added in Word
- The five borduns as part of a song page — they exist as their own files

---

## Architecture

Two clearly separated halves.

### 1. Import (build-time, never in the browser)

A script reads `.mscz` files, parses the `.mscx` XML inside, and emits committed JSON.
The running app never parses a MuseScore file.

Rationale: songs load instantly, and a MuseScore version bump can only ever break a
script we re-run offline — never a lesson in progress.

The importer:
- Extracts title, level, time signature, notes, durations, lyrics, spelling
- Reads a tempo marking where MuseScore has one, falling back to 100 BPM
- **Harvests the colour table from the files themselves** rather than hand-typing a
  Boomwhacker palette, and errors if two files disagree about a pitch's colour
- Reads MuseScore `<LayoutBreak>` elements to preserve the book's line breaks
- Refuses to emit anything it cannot verify: bars that do not sum to the time
  signature, unknown durations, pitches outside the instrument range

### 2. Runtime (browser)

Vite + React + TypeScript + Tailwind. Static build, deployed to Vercel, with
`vite-plugin-pwa` caching songs and samples for offline use.

Not Next.js: no server, no database, no auth. Next would be weight without benefit.

---

## Data model

```ts
type Duration = 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth'
type KeyName = 'C' | 'D' | 'F' | 'G'

interface LyricSyllable {
  text: string
  syllabic: 'single' | 'begin' | 'middle' | 'end'
}

interface Note {
  pitch: number | null        // MIDI number; null = rest
  tpc: number                 // tonal pitch class — determines spelling (F# not Gb)
  duration: Duration
  dotted: boolean
  lyrics: LyricSyllable[]     // index = lyric line; [0] main, [1] pinyin
}

interface Song {
  id: string                  // 'good-night-sleep-tight'
  title: string
  titleAlt?: string           // e.g. 茉莉花
  level: 1 | 2 | 3 | 4
  timeSignature: [number, number]
  sourceKey: KeyName          // the key the MuseScore file is written in
  notes: Note[]
  phrases: string[]           // e.g. ['A','B'] — one letter per phrase box
  phraseGrouping?: number[]   // bars per box; defaults to all 1s (one box per bar).
                              // Must be same length as `phrases`, and must sum to
                              // the song's bar count. Mò Lì Huā is [2,2,2,2].
  systemBreaks?: number[]     // bar indices where a new line starts
  defaultTempo: number
}
```

### Keys and transposition

Only the source key is stored. The other three are generated:

| Target | Semitones | TPC shift |
|---|---|---|
| C → D | +2 | +2 |
| C → F | +5 | −1 |
| C → G | +7 | +1 |

The TPC shift is what guarantees correct spelling — the D-key version yields **F♯**,
never G♭.

Verified against the book's own page titles:

- `G E` → `A F♯` / `C A` / `D B` — matches the *Good Night, Sleep Tight* pages
- `C D E G A` → `D E F♯ A B` / `F G A C D` / `G A B D E` — matches the *Mò Lì Huā* pages

Because it round-trips exactly, **the "GE" / "AF♯" subtitle is derived from the pitch
set, not stored.**

### Accidentals

**Decision: no key signature; every note that needs an accidental gets one, every time.**

The key signature is always empty. VexFlow's automatic accidental logic is switched
off and accidentals are placed explicitly per note.

This is a **deliberate departure from the printed book**. In *Bow, Wow, Wow!* the
current page draws one sharp and leaves the following three F♯s bare, per standard
convention. The app draws all four. This favours a student reading note by note, who
should never have to remember a sign from earlier in the bar.

### Borduns

Five fixed one-bar patterns — Chord, Broken, Levels, Crossover, Crossover Challenge —
identical on every page of the book, varying only by key. Defined once, transposed
by the same rules as melodies, looped under the song.

Each bordun event carries a **hand assignment**, because the five borduns are hand-technique
lessons: chord is both hands together, broken alternates, crossover crosses one hand over.

```ts
interface BordunEvent {
  beat: number
  pitches: number[]           // usually tonic + fifth
  duration: Duration
  hand: 'L' | 'R' | 'both'
}
```

---

## Screen

Three stacked zones filling the viewport. Nothing scrolls.

```
┌─────────────────────────────────────────────┐
│  MELODY XYLOPHONE     (bars light + mallets)│
├─────────────────────────────────────────────┤
│  Title              Key of C                │
│  ╭── A ──────────╮  ╭── B ────────────────╮ │
│  │  G   E   G   E │  │ G G  E E  G G   E  │ │
│  │ Good night…    │  │ friends will…      │ │
│  ╰────────────────╯  ╰────────────────────╯ │
│        ▲ cursor — page stays still          │
├─────────────────────────────────────────────┤
│  BORDUN XYLOPHONE     (flashes on the beat) │
├─────────────────────────────────────────────┤
│  CONTROLS                                   │
└─────────────────────────────────────────────┘
```

Whole song visible at once. Only the cursor and highlights move. Justified by the fact
that no song in the book exceeds 8 bars, and by the teaching goal — students can see
the whole phrase structure, which is the point of the coloured boxes.

### Notation rendering

VexFlow draws the scaffolding: stave, treble clef, time signature, barlines, stems,
beams, ledger lines.

Drawn by us on top, using coordinates VexFlow reports:

- **Noteheads** — VexFlow's defaults suppressed, replaced with a filled coloured circle
  carrying the pitch letter. This is the book's visual signature and appears on every note.
- **Lyrics** — our own text layer, not VexFlow annotations, because *Mò Lì Huā* needs two
  stacked lines (Chinese + pinyin) and note x-positions are already known.
- **Phrase boxes** — rounded rectangles from first to last note of each phrase, coloured
  by letter, drawn behind the staff. Same letter always means same colour, so identical
  phrases visibly match.
- **Cursor** — a vertical marker travels to the current note *and* that note's circle lights up.

### Xylophones

SVG, drawn from the student's viewpoint (low notes left).

Full diatonic row with **F♯ and B♭ raised above as separate bars**, mirroring the removable
chromatic bars on a real Orff instrument. Bars outside the current key's pentatonic are
**dimmed** — the on-screen equivalent of physically taking bars off.

Two mallets per instrument, animating to strike bar centres. The bordun instrument uses
the real hand assignment from the pattern; the melody instrument alternates, which is the
standard sticking to teach anyway.

---

## Timing and audio

**Tone.js Transport**, running on the audio clock.

**The critical rule:** audio is scheduled *ahead*; visuals are *read back*. Tone's scheduled
callbacks fire early by design (lookahead), so driving the cursor from them would run it
ahead of the sound. Instead, every animation frame asks the transport for the current
position and lights the note belonging to that moment.

Getting this backwards produces a subtly-wrong feel that is miserable to debug later.

**The schedule builder is a pure function:**

```
(song, key, bordun, tempo, repeats) → TimedEvent[]
```

This is the decision that makes timing testable — exact event times can be asserted with
no audio context, no speaker, and no flaky timing test.

**Playback:** four metronome beats of count-in at the set tempo, then the song plays a
selectable number of times — **1** (default), 2, 4, 8, or continuous until stopped.
Count-in happens once at the start, not before each repeat.

**Three independent sound sources**, all on by default: melody, bordun, and a metronome
click accented on beat one. The teacher demonstrates with everything sounding, then mutes
parts as each half of the class takes over.

**Audio unlock:** browsers require a user gesture before audio starts. The Play button
provides it via `Tone.start()`.

---

## Controls

Song list · four key buttons (labelled with their note sets) · five bordun buttons ·
tempo · repeat count · play/stop · three mute toggles · fullscreen.

**Keyboard shortcuts** — spacebar for play/stop, arrows for tempo — so the app can be
driven from across the room rather than from the laptop.

---

## Testing

The design deliberately pushes the hard parts into pure data so they can be tested
without a browser or a speaker.

| Area | Test |
|---|---|
| Importer | Golden test: `tests/fixtures/goodnight-sleep-tight.mscx` must yield exactly 11 notes; pitches `67,64,67,64,67,67,64,64,67,67,64`; durations quarter×4, eighth×6, quarter; lyrics as 11 separate syllables — `Good` `night,` `sleep` `tight,` `friends` `will` `come` `to` `mor` `row` `night!` — with `to/mor/row` carrying syllabic begin/middle/end |
| Transposition | Every song in every key produces the note set named in the book's own page titles; F♯ is spelled as a sharpened F |
| Validation | Every song's bars sum to its time signature |
| Schedule builder | Exact-event assertions for given song/tempo/repeats |
| Rendering | SVG snapshots for a representative song per level |

The golden test values were read directly out of Lacie's file, so they are observed
facts rather than expectations.

---

## Open items

Neither blocks implementation.

**Sound samples.** A glockenspiel sample set is needed, with a licence that survives a
school using it. Plan: source CC0 samples and let Tone pitch-shift a handful across the
range. A small but genuine task.

**Fonts.** The book uses **Atop** for "LEVEL 1:" and **Chalkboard** for titles. Chalkboard
is a macOS system font — present on Lacie's laptop, absent elsewhere. Atop appears to be
licensed. Either license and self-host them, or choose close web-safe equivalents and
accept slightly different titles.

---

## Content authoring still required

- Phrase letter sequences for all 19 songs (small — e.g. `A B` for *Good Night*,
  `A B C B` for *Frog in the Meadow*, `A A B C` for *Mò Lì Huā*)
- The remaining `.mscz` source files, for songs and borduns, dropped into `source/`
