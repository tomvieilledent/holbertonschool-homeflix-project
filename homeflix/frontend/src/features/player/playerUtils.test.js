import { describe, expect, it } from 'vitest'
import { clamp, formatClock, spokenDuration } from '@/features/player/playerUtils'

describe('formatClock', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [62, '1:02'],
    [596, '9:56'],
    [3723, '1:02:03'],
    [Number.NaN, '0:00'],
    [-4, '0:00'],
    [59.9, '0:59'],
  ])('%s s → %s', (seconds, text) => {
    expect(formatClock(seconds)).toBe(text)
  })
})

describe('spokenDuration', () => {
  it.each([
    [0, '0 seconde'],
    [1, '1 seconde'],
    [125, '2 minutes 5 secondes'],
    [3600, '1 heure'],
    [3723, '1 heure 2 minutes 3 secondes'],
  ])('%s s → %s', (seconds, text) => {
    expect(spokenDuration(seconds)).toBe(text)
  })
})

describe('clamp', () => {
  it('borne entre min et max', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
  })
})
