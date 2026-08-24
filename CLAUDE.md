# Melody Songbook — Claude Code Context

A classroom Orff play-along built for Lacie (music teacher, SCIS). Projector-first.
Deployed at https://melody-songbook.vercel.app

- **Spec:** `docs/superpowers/specs/2026-08-23-melody-songbook-playalong-design.md`
  — read its "What executing the data pipeline changed" section, which supersedes
  earlier statements in the same file.
- **Data pipeline plan:** `docs/superpowers/plans/2026-08-23-data-pipeline.md`
- **Execution log (rulings made during the build):**
  `docs/superpowers/plans/2026-08-23-data-pipeline-execution-log.md`

## Shape of the project

Two cleanly separated halves:

1. **Build-time import** (`scripts/import/`) — parses `.mscz` archives into
   committed JSON. Never runs in the browser. Re-run with `npm run import`.
2. **Runtime app** (`src/`) — reads `src/data/*.json`. Nothing under `src/` may
   import `fflate`, `@xmldom/xmldom`, or anything under `scripts/`.

`npm test` · `npx tsc --noEmit` · `npm run build` · `vercel deploy --prod --yes`

---

## Layout lessons (learned the hard way — please don't relearn these)

Several rounds of "make it bigger" feedback were spent tuning the wrong
things. The pattern behind almost all of it:

### Check whether the box is bigger than its content BEFORE blaming the container

When something looks small with white space around it, there are two very
different causes and they need opposite fixes:

- **The content's box is padded with dead space.** Fix by cropping the box.
- **The container is a different shape than the content.** Aspect-fit then
  necessarily letterboxes; only reshaping the container or the content helps.

I diagnosed the second when it was actually the first, and argued (wrongly,
twice) that filling the width required starving the instruments. It didn't —
a fifth of the notation canvas was simply blank. **Measure where the content
actually starts and ends inside its own viewBox before touching layout.**

### VexFlow specifics that have each cost real time

- **A `Stave` reserves blank space ABOVE its top line** (for tempo text,
  ottava marks). It scales with `spacingBetweenLinesPx`, so widening the
  spacing silently grows the dead band. Always crop the viewBox to real
  content — `getBBox()` on the rendered SVG is the honest answer.
- **`stave.getBottomY()` is not the visible bottom staff line.** It sits well
  below it (VexFlow reserves room for its own lyric annotations, which this
  app doesn't use). Use `getYForLine(4)`. Same for the top: `getYForLine(0)`,
  not the constructor Y.
- **Beams must be generated BEFORE `voice.draw()`.** `Beam.generateBeams()`
  sets each note's internal beam reference, which is what makes the note skip
  drawing its own flag. Generate after, and every beamed eighth shows a beam
  *and* a leftover flag.
- **VexFlow 5 does not render the `Accidental` modifier in this setup** — it
  emits an empty element. Sharps live inside the coloured notehead instead,
  which matches the printed book anyway.
- **Notehead vs line spacing is a ratio, not a size.** Scaling the whole
  picture never fixes noteheads overlapping staff lines; only
  `spacingBetweenLinesPx` relative to notehead size does.

### Derive geometry, never hardcode it

Every layout bug in this project traced back to a constant that was correct
when written and went stale when the scale changed — the cursor's height, the
lyric gap, the canvas's trailing space, the bordun staff's fixed height. If a
number describes where something *is*, compute it from the drawn object.

---

## Verifying changes (the harness has two traps)

1. **A hidden browser tab fires zero `requestAnimationFrame` callbacks.**
   Playback visuals are driven by rAF reading the audio clock, so in a
   backgrounded tab the cursor freezes and the count-in sticks on "1". This
   is *not* an app bug — check `document.visibilityState` before chasing it.
2. **The service worker serves the previous bundle.** After every deploy,
   unregister it and clear caches before trusting what you see:
   ```js
   (await navigator.serviceWorker.getRegistrations()).forEach(r => r.unregister())
   ;(await caches.keys()).forEach(k => caches.delete(k))
   ```
   The screenshot tool also intermittently renders at a wrong scale — DOM
   measurement (`getBoundingClientRect`, `getBBox`) is the reliable check.

**Prefer measuring over looking.** Nearly every real fix here came from
reading numbers out of the live DOM, not from a screenshot.

---

## Domain facts worth knowing

- **Sounding vs written:** borduns are written high but played two octaves
  down (`BORDUN_PLAYBACK_SHIFT = -24`). Notation shows written pitch; the
  schedule builder applies the shift.
- **F♯ replaces F**, never sits beside it — students physically swap the bar,
  so `barsForRange` takes the key and shows one or the other in the same slot.
  B♭ never appears in this songbook.
- **Mallet hands are authored per bordun pattern**, not inferrable. Broken
  Bordun alternates L/R while sounding one pitch at a time, so any logic that
  guesses hand from "how many pitches are sounding" is wrong.
- **Two songs are deliberately written an octave low** in F and G
  (`ece-has-a-music-room`, `shake-them-simmons-down`) — they start on sol, so
  a mechanical transposition would run off the top of the instrument.

## Open items for Lacie

- `cut-the-cake`'s key-D label reads `DF#EAB D` where every other label in the
  book ascends — looks like a typo in the source file. The importer is faithful.
- Bordun hand assignments in `src/data/bordunHands.ts` are a best reading and
  still want her confirmation.
- The instrument is a synthesized bell voice, not sampled glockenspiel —
  swappable behind one interface in `src/audio/instrument.ts`.
