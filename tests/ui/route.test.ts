import { describe, it, expect } from 'vitest'
import { routeFromHash, hashForRoute } from '../../src/ui/route'

describe('routeFromHash', () => {
  it('opens the songbook by default', () => {
    expect(routeFromHash('')).toBe('play')
    expect(routeFromHash('#')).toBe('play')
  })

  it('opens the bar bench at #bench', () => {
    expect(routeFromHash('#bench')).toBe('bench')
  })

  it('falls back to the songbook for anything it does not know', () => {
    expect(routeFromHash('#kitchen')).toBe('play')
  })

  it('round-trips through hashForRoute', () => {
    expect(routeFromHash(hashForRoute('bench'))).toBe('bench')
    expect(hashForRoute('play')).toBe('')
  })
})
