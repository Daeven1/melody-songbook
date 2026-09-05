# Mallet sticking — the rules behind Lacie's examples

Derived from Lacie's table of all 19 songs plus her follow-up notes, and checked
against the actual note data. This is the specification the code implements.

## Why this needed writing down

Two earlier attempts got sticking wrong in opposite directions: one mallet
travelling between two bars, then two mallets alternating on a single bar. Both
came from assuming sticking is a function of PITCH — that a bar belongs to a
hand for the whole song.

It isn't, and Lacie's examples disprove it outright:

- **Au Clair de la Lune** — `re-mi-re: right-right-right`, then
  `do-mi-re-re-do: left-right-left-left-left`. Same *re*, different hand.
- **Bow Wow Wow** — `do` is left-hand in two phrases, right-hand in `mi-re-do`.

Sticking is decided **per phrase**, with lookahead to what comes next.

## The rules, in priority order

### 1. Two-note songs — one hand per note, never alternating

Lower note left, higher note right, for the whole song.

Applies to: Goodnight Sleep Tight, Frog in the Meadow, Rain Rain Go Away,
Starlight Starbright. Also Closet Key, which Lacie says to "treat the same way
as the 2 notes" — with the added note that its *re* takes the left hand.

### 2. Anchor — a low note returned to repeatedly stays in one hand

When a phrase leaps away from a low note and keeps coming back to it, the left
hand holds that note and the right takes everything above. Lacie: *"mi-so-la-so-mi
… it's best to keep the left hand on mi and let the right hand tackle the higher
notes."*

This is what explains the repeated notes that DON'T alternate:

- `do-do-do: left-left-left` (Au Clair, Bow Wow Wow) — left is anchored on *do*.
- `re-mi-re: right-right-right` (Au Clair) — the right hand has the upper notes.
- `so-so-mi so-so-mi: right-right-left` (Teddy Bear) — *mi* is the anchor.

### 3. Otherwise alternate — including on repeated notes

Alternation is the default and is preferred wherever it works.

### 4. A rest resets the pattern

A rest is time to reposition both mallets, so a repeated rhythmic figure after a
rest starts on the same hand again rather than continuing the flip. Lacie:
*"the rest gives a natural break to repeat the alternating mallet pattern on each
new note."*

Seen in Bow Wow Wow and Peas Porridge Hot, whose phrases are rest-separated.

### 5. Alternate by GROUP where notes repeat in pairs

The cadence `mi-mi-re-re-do` is `right-right-left-left-right` in all three songs
that use it (ECE, Shake Them 'Simmons Down, Cut the Cake) — the hand changes per
repeated-note group, not per note.

### 6. Crossover as a taught idiom

`mi-re-do` standing as its own phrase is always `right-left-right` — the right
hand crosses over to take the lowest note. Consistent in Hot Cross Buns, Bow Wow
Wow, Pumpkin Pumpkin, I'm an Acorn.

Note it does NOT apply when the same three notes are embedded mid-phrase:
Great Big House's `mi-so-mi-re-do` is `left-right-left-right-left`, plain
alternation.

### 7. Lookahead overrides everything

Lacie: *"Alternating mallets is prioritized when possible, but what happens next
and how predictable or complex the melody is determines whether alternating is
the preferred approach."*

Where a rule would strand a hand for the next phrase, the sticking that leaves
the hands better placed wins. **This is why the authored table is authoritative
over any rule the code applies.**

## Phrases are rest-delimited — verified

Lacie's per-line groupings correspond exactly to the rest-separated groups in the
song data. Checked by generating solfège from `songs.json`:

| Song | Data groups | Lacie's lines | Match |
|---|---|---|---|
| Teddy Bear | 9 + 9 + 9 + 9 = 36 | 9 + 9 + 9 + 9 | exact |
| Mo Li Hua | 11 + 11 + 8 + 10 = 40 | 11 + 11 + 8 + 10 | exact |
| Au Clair | 11 (× 2 verses) | 3 + 3 + 5 = 11 | exact |
| ECE Has a Music Room | 12 (× 2 verses) | 7 + 5 = 12 | exact |
| Ring Around the Rosie | 19 | 6 + 6 + 4 + 3 = 19 | exact |
| Great Big House | 25 | 7 + 6 + 7 + 5 = 25 | exact |
| Shake Them 'Simmons Down | 26 | 7 + 7 + 7 + 5 = 26 | exact |
| Cut the Cake | 22 | 6 + 5 + 6 + 5 = 22 | exact |
| Bow Wow Wow | 3 + 4 + 10 = 17 | 3 + 4 + 7 + 3 = 17 | exact |
| Pumpkin Pumpkin | 7 + 11 = 18 | 7 + 8 + 3 = 18 | exact |

Rests carry no hand: the mallet isn't playing.

## Lacie's revised table (supersedes the first pass)

Her second pass covers all 19 songs and changes several earlier answers. Her
stated principle for the revision:

> Alternating mallets is very complicated and adds a lot to remember. The
> complexity in alternating should only be prioritized when it makes the
> absolute best outcome.

She also notes the song ORDER encodes a skill progression — a two-note song is
easier than a three-note song — so sticking gets more demanding as the book goes
on, rather than being uniform.

Changed from her first pass:

| Song | Change |
|---|---|
| Au Clair de la Lune | verse now ends on a crossover (right) instead of left |
| Great Big House | closing phrase `mi-so-mi-re-do` is now `L-R-R-L-R` |
| Shake Them 'Simmons Down | second phrase now ends `…left-left` |
| Mo Li Hua | third phrase now ends right instead of left |
| Closet Key | now a full sequence; final `do` is a crossover, which the old scale-degree rule got wrong |
| Hot Cross Buns, Mary, Peas Porridge | now complete |

## Coverage — where the table stops

All 19 songs are now covered: 15 as authored sequences, 4 (the two-note songs)
as a rule. Every sequence divides its song's note count exactly, asserted by
test — without that, a miscounted syllable would drift the sticking silently out
of step with the melody.

**Two hands are inferred rather than given**, and are worth confirming:

| Song | Issue | What was assumed |
|---|---|---|
| Pumpkin, Pumpkin | `so-so-so-la-so-mi-do-re` has 8 notes but 7 hands listed | final `re` taken as LEFT, following the left hand already on `do`, and matching her earlier draft of the line |
| I'm an Acorn | `mi-so-so-la` (4 notes) has 8 hands listed, so cannot be read directly | her earlier `left-right-right-right` kept, which makes the verse add up to 14 |

## Notes on the data

- Sticking is **relative**, so one sequence per song serves all four keys.
- Two songs are written an octave lower in F and G (`ece-has-a-music-room`,
  `shake-them-simmons-down`); their sticking is unaffected, being relative.
- ECE's solfège runs `DO-DO-DO-so-la-la-so-MI-MI-RE-RE-DO` where DO/MI/RE are
  ABOVE *so* and *la* — the tonic sits in the middle of its range. Any rule
  reasoning about "low" and "high" has to use actual pitch, not scale degree.
