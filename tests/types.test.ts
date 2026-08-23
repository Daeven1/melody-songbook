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
