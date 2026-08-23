# SDD ledger — plan: docs/superpowers/plans/2026-08-23-data-pipeline.md

Spec: docs/superpowers/specs/2026-08-23-melody-songbook-playalong-design.md (read)
Branch: data-pipeline (created off main; main was clean)

## Pre-flight scan

### Cross-task interface pairs (shared files or symbols)

| Producer | Consumer | Produces -> Consumes | Finding |
|---|---|---|---|
| T1 src/types.ts | T5,T6,T7,T8,T9 | Duration/KeyName/Note/Bar/Song/Bordun*, KEY_NAMES, DURATIONS, DURATION_TICKS, TICKS_PER_QUARTER, TICKS_PER_BAR | OK — every symbol consumed is defined in T1 |
| T2 pitch.ts | T3, T7, T8, T9 | pitchClass, spelledName | OK |
| T3 colours.ts | T8 | PITCH_COLOURS | OK |
| T4 dom.ts | T5, T8 | childElements, firstChildNamed, textOf, frameText | OK |
| T4 mscz.ts/sections.ts | T5,T6,T7,T8 | readMscz, musicStaff, extractSections, RawSection | OK |
| T5 bars.ts | T6, T7, T8 | barsFromMeasures | OK |
| T6 systems.ts | T6 song.ts | systemBreaksFor | OK |
| T6 song.ts | T8 index.ts | buildSong | OK |
| T7 bordunHands.ts | T7 bordun.ts | BORDUN_HANDS | OK |
| T7 bordun.ts | T8 index.ts | buildBorduns | OK |
| T8 index.ts | T9, T10 | src/data/songs.json | OK — ordering dependency respected (T8 precedes T9/T10) |
| T8 validate.ts | T8 index.ts | validateDocument, validateBars, songFiles, bordunFile | OK |

### Task-internal agreement (tests specified vs code specified)

| Task | Finding |
|---|---|
| T1 | OK — test asserts KEY_NAMES/DURATIONS; both defined. Interfaces block also lists types used only by later tasks; harmless. |
| T2 | OK — 6 symbols imported, 6 exported. `Consumes: src/types.ts` is listed but pitch.ts imports nothing; overstated, harmless. |
| T3 | OK — colourForPitch(61) -> pitch class 1 -> name 'C#', matching the /C#/ throw assertion. |
| T4 | OK — three files created, three imported by the test. |
| T5 | OK. Note: firstSectionBars() runs in describe bodies, so a parse failure surfaces as a collection error rather than a test failure. Acceptable. |
| T6 | OK — slugify('ECE Has a Music Room') -> 'ece-has-a-music-room' matches the assertion. |
| T7 | OK — Map iteration order is not relied on; the id assertion sorts. |
| T8 | OK — sourceFiles() uses non-recursive readdirSync and filters .mscz, so the _superseded/ directory entry is excluded. |
| T9 | OK — requires songs.json from T8; plan order satisfies it. |
| T10 | OK — 16 entries are transcription from the PDF, procedure and validating tests both specified. |

### Findings and rulings

FINDING 1 (T1, real defect): vite.config.ts uses `defineConfig` imported from
'vite', then passes a `test:` key. That key is not in Vite's config type, so
`tsc` fails.
Ruling: import `defineConfig` from 'vitest/config' instead, which types both
`plugins` and `test`. Carried into the Task 1 dispatch.
Cost if wrong: none — 'vitest/config' re-exports Vite's defineConfig and is the
documented way to co-locate the two configs.

FINDING 2 (T2, YAGNI): `octaveOf` is exported and tested but no task in this
plan consumes it.
Ruling: keep it. It is two lines, fully tested, and Plan 2's xylophone needs
scientific octave numbers to lay out bars. Removing it now only to re-add it is
churn. Reviewers may flag it; this ruling is the answer.
Cost if wrong: two dead lines until Plan 2 starts.

## Task log

Task 1: complete (commits 8c32bce..b9230b1, review clean)
Task 1: reviewer raised one "cannot verify from diff" item — Node 24 LTS.
  Ruling: not a gap. The constraint describes the dev environment, and Task 1's
  file list specifies neither .nvmrc nor an engines field. Local node is v25.9.0 (above the floor); no code change needed.
  Cost if wrong: a contributor on an older Node hits an unclear failure instead
  of a clear engines warning.
Task 1: accepted src/vite-env.d.ts (unlisted file). Ruling: legitimate — without
  it `tsc` fails on main.tsx's CSS import, breaking `npm run build`, a script the
  brief itself specifies. The gap was in the brief, not the implementation.
  Cost if wrong: one redundant line.
Task 2: complete (commit 62bca1b, review clean) — batched with Task 3
Task 3: complete (commit 5d9d680, review clean) — batched with Task 2
  Batched because both are small pure-function modules with complete code in
  their briefs. Reviewed as one unit; reviewer hand-verified tpc 6 and tpc 26
  outside the tested range, and the colour table digit by digit.
Task 4: complete (commit 62b6bce, review clean)
  Implementer flagged that the non-canonical bordun file has 24 frames vs the
  canonical 20. Ruling: not a defect — the plan already designates
  "G2 - Bordun Techniques & No Lyrics.mscz" as canonical and excludes the other
  (it holds extra Bb and A patterns absent from the songbook). Task 7/8 encode it.
  Cost if wrong: none; Task 7's frame-count assertion would fail loudly.
Task 5: review — spec OK; 1 Important + 1 Minor finding, both plan-mandated
  (the defective code came from the brief's own reference implementation).
  Ruling: fix both. requireInt's `raw === null` guard misses a present-but-empty
  element, and Number('') === 0 passes Number.isInteger, so an empty <pitch>
  becomes pitch 0 silently. The spec requires the importer to "refuse to emit
  anything it cannot verify", so the spec overrides the plan text here. The Minor
  (NaN lyric line index silently dropping a lyric) is the same defect class in the
  same file and one line to fix, so it goes in the same round rather than deferring.
  Cost if wrong: slightly stricter parsing than the corpus needs — would only bite
  if a future MuseScore file legitimately used an empty element, which is not valid.
Task 5: reviewer raised one "cannot verify from diff" item — the <voice> fallback
  and multi-voice ordering are unexercised, because every measure in the corpus has
  exactly one <voice>.
  Ruling: not a gap, keep the fallback. Removing it would make a future no-<voice>
  file yield zero notes silently; keeping it means such a bar fails Task 8's
  validateBars 4/4 sum check loudly. The downstream guard is the real net.
  Cost if wrong: three lines of defensive code that never run.
Task 5: fix round 1/5 (2 addressed, 0 open; commits 039edc3..04c1dcb)
Task 5: minor (deferred): requireInt's error message says "Missing <pitch>" for a
  present-but-empty element too — imprecise wording, no behavioural defect.
Task 5: complete (commits 62b6bce..04c1dcb, review clean)
Task 6: complete (commits 04c1dcb..db11df4, review clean)
Task 6: minor (deferred): scripts/import/song.ts — `section.texts.at(-1)!` is
  guarded only for section 0; sections 1-3 would throw a bare TypeError rather
  than the descriptive error used elsewhere if a frame ever had <2 texts. Not a
  live bug (reviewer verified all 19 files have >=2 texts per frame). The code is
  verbatim from the brief; the report's self-review over-claimed that all four
  non-null assertions were guarded.
Task 7: BLOCKED — plan defect, implementer escalated correctly rather than hacking.
  The brief asserts the *CHALLENGE* variant is marked by a VBox subtitle. Verified
  false: that marker is a VBox <Text> for the C frame only; for D/F/G it is a
  <StaffText> inside the first <Measure>. extractSections reads VBox texts only, so
  crossover-challenge got no D/F/G entry and buildBorduns threw.
  Ruling: classify the two crossover variants by MUSICAL SHAPE, not by annotation.
  Verified across all four keys: the plain crossover's final event is a rest
  (C5 G5 C6 REST); the challenge's is a sounding note (C5 G5 C6 G5). No other
  pattern contains a rest, so the rule discriminates only where it should.
  Additionally: cross-check the annotation wherever it appears (VBox Text or
  StaffText) and throw if it disagrees with the shape — the spec requires the
  importer to refuse what it cannot verify, and I have now been wrong once about
  where this marker lives.
  Also: derive Bordun.label from pattern identity, not frame text. A Bordun spans
  four keys but has one label, and the file marks only the C frame — deriving it is
  more correct than taking whichever frame parsed last.
  Cost if wrong: if a future crossover variant also ends on a sounding note the
  classifier becomes ambiguous — but it throws rather than mis-assigning, so it
  fails loudly at build time, never silently in a lesson.
Task 7: complete (commits db11df4..f6522d3, review clean after the ruling above)
Task 7: minor (deferred): tests/import/bordun.test.ts — the test name
  "distinguishes the challenge crossover by its subtitle" is now stale; the
  classifier is shape-based and the subtitle is only a cross-check. Kept verbatim
  because the ruling said the brief's test list stays. Rename at final triage.
Task 8: controller found a REAL DATA DEFECT in the generated songs.json, inherited
  from Task 6's brief. The rule "key label = last text in the frame" is positional
  and wrong for 3 of 76 frames, which store [label, title] instead of [title, label]:
    Frog in the Meadow  frame 3: ['DB', 'Frog in the Meadow']
    Au Clair de la Lune frame 3: ['GAB', 'Au Clair de la Lune']
    Closet Key          frame 2: ['FGA', 'Closet Key']
  Those three key versions imported with the SONG TITLE as their key label, which
  would have displayed wrong information on screen in front of a class.
  Ruling: identify label vs title by CONTENT, not position. The key label is the
  frame text matching /^[A-G][#b₀-₉]?(?:[ ]*[A-G][#b₀-₉]?)*$/
  — note letters, optional accidentals, spaces, optional subscript tonic. Verified
  this matches every real label (AF#, DB, GA EDC, CDEGA C_1) and no real title
  (titles contain lowercase letters, which the pattern rejects).
  Plus two cross-checks that must throw: exactly one label-matching text per frame,
  and the title identical across all four frames of a song.
  Cost if wrong: a future song titled purely in note letters would be ambiguous —
  but the "exactly one label per frame" check throws rather than guessing.
  Note: Task 9's label-subset test would independently have caught this (key G of
  Frog uses D and B, absent from "Frog in the Meadow"). Fixing now rather than
  letting it surface there.
Task 8: fix round 1/5 (1 addressed, 0 open; commits c9fcb9f..bf9d9bf)
Task 8: complete (commits f6522d3..bf9d9bf, review clean)
Task 8: minor (deferred): validate.ts colour check — Number(textOf(note,'pitch'))
  yields 0 rather than throwing if a Note ever lacked <pitch>; same class as the
  Task 5 requireInt defect, different call site.
Task 8: minor (deferred): duplicate-song-id detection has no test exercising its
  throw path; correct by inspection, but only covered by the corpus not colliding.
Task 8: minor (deferred): the corpus-invariants describe() loop generates zero
  it() calls if sourceFiles() ever returned empty, which would vacuously pass.
  Mitigated indirectly by the separate "finds 21 files" test. Verbatim brief code.
Task 9: the agreement test FOUND SOMETHING — 4 of 76 assertions failed.
  ece-has-a-music-room and shake-them-simmons-down, keys F and G, sit uniformly
  -12 semitones below naive transposition.
  Investigated: this is deliberate, not a mis-split. Evidence:
   (1) the delta is uniformly exactly -12 across every note in the section, not
       scattered as a split error would be;
   (2) tpc spelling is preserved correctly throughout;
   (3) those sections' key labels list exactly the right note sets;
   (4) these are precisely the two songs whose C version starts on sol (G4-E5)
       rather than do, so naive +5/+7 would reach A5/B5 — above the practical
       soprano xylophone range. Every song starting low transposes exactly.
  Ruling: the test's invariant was mis-stated, not the data. Agreement should be
  asserted UP TO A UNIFORM OCTAVE: all per-note deltas equal, and that delta a
  multiple of 12. That still catches a mis-split (which yields non-uniform deltas
  or wrong pitch classes) while permitting the teacher's register choice.
  Additionally pin the expected octave offset per song/key in an explicit table, so
  the two known -12 cases are documented rather than silently tolerated, and any
  new octave shift fails loudly.
  Cost if wrong: if these two really were mis-split we would accept corrupt data —
  but a mis-split cannot produce a clean uniform -12 with correct spelling AND
  matching labels, so confidence is high. Flagging to David regardless.
Task 9: fix round 1/5 (1 addressed, 0 open; commits 384fe16..12b92b1)
Task 9: complete (commits bf9d9bf..12b92b1, review clean)
  All 76 agreement assertions pass under the corrected invariant: 72 at offset 0,
  4 at the documented -12. Reviewer confirmed the relaxed rule still catches a
  mis-split (all deltas must be equal; one differing note fails) and that the
  offset table is load-bearing, not descriptive.
Task 9: minor (deferred): the data-driven describe loops in transpose.test.ts would
  generate zero it() calls on an empty songs.json, and a zero-bar key version would
  trivially satisfy every assertion. Dormant (19 songs x 4 keys = 76, none empty).
  Same structural weakness as the Task 8 minor; worth one shared guard at triage.
Task 10: complete (commit 42ee547, review clean)
  Reviewer independently re-read all 19 pages and agreed box-for-box, zero
  disagreements, including all five grouping cases and the sole mixed grouping
  (ring-around-the-rosie [1,1,2]).
Task 10: minor (deferred): the "letters start at A with no gaps" test sorts the
  distinct set, so it verifies contiguity but not first-appearance order —
  ['B','A'] would pass. Committed data is correct everywhere; guard is weaker
  than its name suggests. Verbatim brief code.

## All 10 tasks complete. Final whole-branch review next.

## Final whole-branch review — spec coverage NOT clean; one fix wave dispatched

Findings accepted (all four merge-blockers plus one spec gap the reviewer listed
but did not block on):
 1. IMPORTANT, wrong data: au-clair-de-la-lune bar 0 note 0, all four keys, imports
    lyrics as ['Au','','At']. The source tags that one English syllable <no>2</no>
    while the other 84 use <no>1</no>, so bars.ts leaves a hole at index 1. A
    renderer drawing lyrics[1] shows a blank where "At" belongs. Third call site of
    the same "silently accepts unverifiable input" class fixed twice already.
    Ruling: compact each note's occupied lyric lines, AND throw if a note ever has
    a lyric above line 0 with nothing at line 0 (compaction would be wrong then).
    Verified empirically: 0 such notes exist, so compaction is provably safe here.
    Cost if wrong: none on this corpus; the new guard converts the risk case into a
    build failure rather than a silent remap.
 2. FORBIDDEN_ELEMENTS omits startRepeat/endRepeat — spec and plan both mandate
    rejecting repeats, and the bar-sum check does not backstop them.
 3. No pitch-range rejection — spec line 178 requires it; a C7 or C2 passes today.
 4. borduns.json emitted in file order (levels, broken, chord, crossover-challenge,
    crossover) not the book's page order. Plan 2 iterates this to build five buttons
    and would show *CHALLENGE* before the plain crossover.
 5. defaultTempo hardcoded to 100; spec says read a tempo marking where present and
    fall back to 100. No <Tempo> exists in the corpus so output is unchanged today,
    but an authored tempo would be silently discarded.
Deferred-minor triage accepted. Ledger minor "Task 6: section.texts.at(-1)!" is
  STRUCK — Task 8's content-based rewrite deleted that code entirely.
Two stale test names promoted to must-fix (they misdescribe settled rulings).
FOR DAVID, not a code change: cut-the-cake's key-D label is authored "DF#EAB D",
  where every other label in the book is ascending (DEF#AB). Importer is faithful;
  it looks like a typo in Lacie's file and it will be projected on screen.
Final fix wave: all 6 findings ADDRESSED, no new breakage (commits 42ee547..0aa2d4f).
  Finding 5 (tempo) is ADDRESSED BUT UNVERIFIED — no corpus file has a <Tempo>
  element, so the qps->BPM conversion is self-consistent and safely falls back but
  has never run against real data. Carry to David as a known-unproven path.
Final: parked — buildBorduns never asserts collected.size === 5, so a classification
  collapse would return a short array rather than throw. Ruling: park. Pre-existing,
  not introduced by the fix wave, and a test already pins all five ids, so it fails
  in CI rather than in a lesson. One-line follow-up if anyone wants it closed.
  Cost if wrong: none today; the id test is the real net.
