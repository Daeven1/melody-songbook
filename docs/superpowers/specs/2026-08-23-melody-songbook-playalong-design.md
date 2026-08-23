# Melody Songbook Play-Along — Design

**Date:** 2026-08-23
**Status:** Approved design, ready for implementation planning
**Author:** David Rempel (concept by Lacie)

> Revised 2026-08-23 after analysing the full MuseScore corpus. The corpus contradicted
> two assumptions in the first draft; both are corrected below and marked **[corpus]**.

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

`reference/` holds the 78-page PDF: 2 cover pages + 76 song pages = **19 songs × 4 keys**.
The PDF has **no text layer** — every page is a flat image. It is a visual reference only;
no data is extracted from it.

`source/` holds 21 MuseScore files the importer reads: **19 song files + 2 bordun files**.
`source/_superseded/` holds three redundant copies of *Good Night, Sleep Tight* and is ignored.

### Corpus facts (verified across all 21 files, ~2,000 notes)

| Property | Finding |
|---|---|
| MuseScore version | 4.50 throughout |
| Staves / parts | Exactly 1 of each per file — melody is monophonic |
| Time signature | 4/4 everywhere, no exceptions |
| Key signature | `concertKey 0` everywhere, **including the D and G versions** |
| Durations used | half, quarter, eighth — nothing else |
| Ties, dots, slurs, repeats, voltas | **None anywhere in the corpus** |
| Layout breaks | Present in 22 files — used as section and line delimiters |

The restricted rhythm vocabulary is a significant de-risking: the notation renderer never
has to handle a tie, a dot, or a repeat structure. **The importer must reject** any future
file that introduces one, rather than silently mis-rendering it.

### **[corpus]** Each file already contains all four keys

The first draft assumed one key per file with the other three generated. That is wrong.
Each `.mscz` is a repeating structure: title frame → bars → `page` layout break, four times.

Verified on *Good Night, Sleep Tight*:

| Section | Pitches | Key |
|---|---|---|
| 1 | G4 E4 | C |
| 2 | A4 F♯4 | D (+2) |
| 3 | C5 A4 | F (+5) |
| 4 | D5 B4 | G (+7) |

The authored intervals are exactly +2 / +5 / +7, matching the rules in the first draft.

**Consequence: there is no runtime transposition.** All four keys are imported as authored.
This removes an entire runtime subsystem and eliminates any risk of the app disagreeing with
the printed book.

The transposition rules survive as a **validation test** instead — see Testing.

### **[corpus]** No key signatures already

Every file, in every key, has `concertKey 0`. MuseScore is already placing accidentals
inline rather than at the clef. The "no key signature" requirement therefore matches how
Lacie authors; it is not a change.

The one genuine departure remains: **the sign is redrawn on every note that needs it.**
The printed book follows standard convention — in *Bow, Wow, Wow!* it draws one sharp and
leaves the following three F♯s bare. The app draws all four, so a student reading note by
note never has to carry a sign forward from earlier in the bar.

### Colour table (verified, zero conflicts)

Every pitch class resolves to exactly one colour across the whole corpus. No file disagrees
with another. This is now fixed data rather than something to harvest defensively — though
the importer should still assert it, so a future edit that breaks it fails the build.

| Pitch | RGB | Pitch | RGB |
|---|---|---|---|
| C | `226, 28, 72` | F♯ | `98, 188, 71` |
| D | `249, 157, 28` | G | `0, 156, 149` |
| E | `255, 243, 43` | A | `94, 80, 161` |
| F | `188, 216, 95` | B♭ | `141, 91, 166` |
| | | B | `207, 62, 150` |

B♭ appears only in the excluded bordun extras (below), so the app never renders it.
The table records it for completeness.

### Borduns

Both bordun files contain the same five patterns × four keys.

`G2 - Bordun Techniques & No Lyrics.mscz` is **canonical**: exactly 20 bars, 5 × 4, nothing else.

`G2 - Bordun Techniques.mscz` adds four bars — Chord and Broken in **B♭ and A** — which do not
appear in the songbook. **Excluded**, pending a decision to add those keys.

The five patterns, in the key of C, as written:

| Pattern | Bar contents |
|---|---|
| Chord | half C5+G5, half C5+G5 |
| Broken | quarter C5, G5, C5, G5 |
| Levels | half C5+G5, half C6+G6 |
| Crossover | quarter C5, G5, C6, rest |
| Crossover *CHALLENGE* | quarter C5, G5, C6, G5 |

**The file stores these in a different order than the page prints them** (file: Levels, Broken,
Chord, Crossover-Challenge, Crossover; page: Chord, Broken, Levels, Crossover, Crossover-Challenge).
The importer must key patterns **by title text, never by position.**

#### Bordun playback octave

As written, the C bordun is C5+G5 while the C melody sits at E4–G4 — the accompaniment
would sound *above* the tune, which is backwards for a drone.

**Decision: bordun plays two octaves below written pitch**, the bass xylophone sound, matching
what a bass player in the room actually produces (bass xylophones sound an octave below written).

**Notation and the bordun instrument still display exactly as written.** The shift is applied at
playback only, and lives in the schedule builder — one constant, one place.

---

## Architecture

Two clearly separated halves.

### 1. Import (build-time, never in the browser)

A script reads `source/*.mscz`, parses the `.mscx` XML inside, and emits committed JSON.
The running app never parses a MuseScore file.

Rationale: songs load instantly, and a MuseScore version bump can only ever break a
script we re-run offline — never a lesson in progress.

The importer:

- Splits each song file on `page` layout breaks into its four key sections
- Extracts title, level, time signature, notes, durations, lyrics, and spelling (`tpc`)
- Reads a tempo marking where MuseScore has one, falling back to 100 BPM
- Preserves line breaks from the remaining layout breaks
- Keys bordun patterns by title text, not position
- **Asserts the colour table** — fails the build if a note's colour contradicts it
- **Rejects anything outside the verified vocabulary**: a time signature other than 4/4,
  a duration other than half/quarter/eighth, any tie/dot/slur/repeat, more than one staff,
  a section count other than 4, bars that don't sum to the time signature, or a pitch
  outside the instrument range

Every one of those checks exists because the corpus currently satisfies it. They are
regression guards on future edits, not speculative validation.

### 2. Runtime (browser)

Vite + React + TypeScript + Tailwind. Static build, deployed to Vercel, with
`vite-plugin-pwa` caching songs and samples for offline use.

Not Next.js: no server, no database, no auth. Next would be weight without benefit.

---

## Data model

```ts
type Duration = 'half' | 'quarter' | 'eighth'
type KeyName  = 'C' | 'D' | 'F' | 'G'

interface LyricSyllable {
  text: string
  syllabic: 'single' | 'begin' | 'middle' | 'end'
}

interface Note {
  pitch: number | null        // MIDI number; null = rest
  tpc: number                 // tonal pitch class — determines spelling (F# not Gb)
  duration: Duration
  lyrics: LyricSyllable[]     // index = lyric line; [0] main, [1] pinyin
}

interface KeyVersion {
  label: string               // 'GE', 'AF#' — derived from the pitch set, not stored by hand
  notes: Note[]
  systemBreaks: number[]      // bar indices where a new line starts
}

interface Song {
  id: string                  // 'good-night-sleep-tight'
  title: string
  titleAlt?: string           // e.g. 茉莉花
  level: 1 | 2 | 3 | 4
  timeSignature: [4, 4]
  keys: Record<KeyName, KeyVersion>
  phrases: string[]           // e.g. ['A','B'] — one letter per phrase box
  phraseGrouping?: number[]   // bars per box; defaults to all 1s (one box per bar).
                              // Same length as `phrases`; must sum to the bar count.
                              // Mò Lì Huā is [2,2,2,2].
  defaultTempo: number
}

interface BordunEvent {
  beat: number
  pitches: number[]           // as written; playback shifts down 24 semitones
  duration: Duration
  hand: 'L' | 'R' | 'both'
}

interface Bordun {
  id: 'chord' | 'broken' | 'levels' | 'crossover' | 'crossover-challenge'
  label: string
  isChallenge: boolean
  keys: Record<KeyName, BordunEvent[]>   // one bar per key, looped
}
```

Key labels ("GE", "AF♯") are derived from each version's pitch set rather than stored,
and are verified against the book's page titles in testing.

---

## Screen

Three stacked zones filling the viewport, plus a control bar. Nothing scrolls.

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

Whole song visible at once. Only the cursor and highlights move. Justified by the corpus —
the longest songs are 8 bars — and by the teaching goal: students can see the whole phrase
structure, which is the point of the coloured boxes.

### Notation rendering

VexFlow draws the scaffolding: stave, treble clef, time signature, barlines, stems,
beams, ledger lines.

Drawn by us on top, using coordinates VexFlow reports:

- **Noteheads** — VexFlow's defaults suppressed, replaced with a filled coloured circle
  carrying the pitch letter. This is the book's visual signature and appears on every note.
- **Accidentals** — placed explicitly per note, with VexFlow's automatic accidental logic
  switched off and the key signature forced empty.
- **Lyrics** — our own text layer, not VexFlow annotations, because *Mò Lì Huā* needs two
  stacked lines (Chinese + pinyin) and note x-positions are already known.
- **Phrase boxes** — rounded rectangles from first to last note of each phrase, coloured
  by letter, drawn behind the staff. Same letter always means same colour, so identical
  phrases visibly match.
- **Cursor** — a vertical marker travels to the current note *and* that note's circle lights up.

### Xylophones

SVG, drawn from the student's viewpoint (low notes left).

Full diatonic row with **F♯ raised above as a separate bar**, mirroring the removable
chromatic bar on a real Orff instrument. (B♭ is never needed — it appears only in the
excluded bordun extras.) Bars outside the current key's pentatonic are **dimmed** — the
on-screen equivalent of physically taking bars off.

Two mallets per instrument, animating to strike bar centres. The bordun instrument uses
the hand assignment from the pattern; the melody instrument alternates, which is the
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
no audio context, no speaker, and no flaky timing test. The bordun's −24 semitone playback
shift is applied here.

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
| Importer golden test | `tests/fixtures/goodnight-sleep-tight.mscx` yields exactly 11 notes; pitches `67,64,67,64,67,67,64,64,67,67,64`; durations quarter×4, eighth×6, quarter; lyrics as 11 separate syllables — `Good` `night,` `sleep` `tight,` `friends` `will` `come` `to` `mor` `row` `night!` — with `to/mor/row` carrying syllabic begin/middle/end |
| **Transposition as validation** | For every song, generating keys 2–4 from key 1 by +2/+5/+7 (with TPC shifts +2/−1/+1) must reproduce the **authored** notes exactly. This proves the imported data is internally consistent and that no section was mis-split. |
| Key labels | Each version's derived label matches the book's page title — `GE`/`AF♯`/`CA`/`DB`, `CDEGA`/`DEF♯AB`/`FGACD`/`GABDE` |
| Spelling | F♯ is spelled as a sharpened F, never G♭ |
| Corpus invariants | Every file: 4/4, one staff, four sections, bars summing to the time signature, durations within the allowed set, colours matching the table |
| Schedule builder | Exact-event assertions for given song/tempo/repeats, including the bordun octave shift |
| Rendering | SVG snapshots for a representative song per level |

The golden-test values and every corpus invariant were read directly out of Lacie's files,
so they are observed facts rather than expectations.

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

Both are small and one-time.

- **Phrase letter sequences for all 19 songs** — e.g. `A B` for *Good Night*,
  `A B C B` for *Frog in the Meadow*, `A A B C` for *Mò Lì Huā*. Read off the PDF.
- **Hand assignments for the 5 bordun patterns** — not present in the MuseScore files.
  Chord and Levels are both hands; Broken alternates; the two Crossovers cross one hand over.
