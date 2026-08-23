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
  // --- Levels 1 & 2 ---
  // p.2  red, green
  'good-night-sleep-tight': { letters: ['A', 'B'] },
  // p.6  red, green, purple, green
  'frog-in-the-meadow': { letters: ['A', 'B', 'C', 'B'] },
  // p.10 red, green, green, red
  'rain-rain-go-away': { letters: ['A', 'B', 'B', 'A'] },
  // p.14 red, green, purple, blue
  'starlight-starbright': { letters: ['A', 'B', 'C', 'D'] },
  // p.18 red, red, green, red
  'hot-cross-buns': { letters: ['A', 'A', 'B', 'A'] },
  // p.22 red, red — each box spans two bars
  'au-clair-de-la-lune': { letters: ['A', 'A'], grouping: [2, 2] },
  // p.26 red, green, red, purple
  'mary-had-a-little-lamb': { letters: ['A', 'B', 'A', 'C'] },
  // p.30 red, green, red, purple
  'closet-key': { letters: ['A', 'B', 'A', 'C'] },
  // p.34 red, green, purple, blue
  'peas-porridge-hot': { letters: ['A', 'B', 'C', 'D'] },

  // --- Levels 3 & 4 ---
  // p.39 red, green, purple, blue
  'bow-wow-wow': { letters: ['A', 'B', 'C', 'D'] },
  // p.43 red, green, red, purple
  'im-an-acorn': { letters: ['A', 'B', 'A', 'C'] },
  // p.47 red, red — each box spans two bars
  'ece-has-a-music-room': { letters: ['A', 'A'], grouping: [2, 2] },
  // p.51 red, green, purple, blue
  'pumpkin-pumpkin': { letters: ['A', 'B', 'C', 'D'] },
  // p.55 red, green, red, purple
  'great-big-house-in-new-orleans': { letters: ['A', 'B', 'A', 'C'] },
  // p.59 red, green, red, purple
  'shake-them-simmons-down': { letters: ['A', 'B', 'A', 'C'] },
  // p.63 red, green, red, purple — each box spans two bars (8 bars total)
  'teddy-bear': { letters: ['A', 'B', 'A', 'C'], grouping: [2, 2, 2, 2] },
  // p.67 red, red, green — the green box spans the last two bars
  'ring-around-the-rosie': { letters: ['A', 'A', 'B'], grouping: [1, 1, 2] },
  // p.71 red, green, red, purple
  'cut-the-cake': { letters: ['A', 'B', 'A', 'C'] },
  // p.75 red, red, green, purple — each box spans two bars (8 bars total)
  'mo-li-hua': { letters: ['A', 'A', 'B', 'C'], grouping: [2, 2, 2, 2] },
}
