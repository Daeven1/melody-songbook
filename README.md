# Melody Songbook Play-Along

A classroom play-along for Lacie's *Melody Songbook* (Levels 1–4). Projector-first.

Design: [`docs/superpowers/specs/2026-08-23-melody-songbook-playalong-design.md`](docs/superpowers/specs/2026-08-23-melody-songbook-playalong-design.md)

## Layout

- `source/` — MuseScore `.mscz` files the importer reads: 19 songs + 2 bordun files. Single source of truth.
- `source/_superseded/` — redundant copies, ignored by the importer.
- `reference/` — the printed songbook PDF. Visual reference only; no data is extracted from it.
- `tests/fixtures/` — extracted `.mscx` used by the importer's golden test.
