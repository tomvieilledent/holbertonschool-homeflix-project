import { describe, expect, it } from 'vitest'
import { playAction } from '@/features/catalogue/format'

describe('playAction', () => {
  it('propose « Lecture » sans progression', () => {
    expect(playAction(null)).toEqual({ label: 'Lecture', startAt: 0 })
    expect(playAction(undefined)).toEqual({ label: 'Lecture', startAt: 0 })
    expect(playAction({ state: 'NOT_STARTED', positionSeconds: 0 })).toEqual({ label: 'Lecture', startAt: 0 })
  })

  it.each([
    [5, 'Reprendre à 0:05'],
    [212, 'Reprendre à 3:32'],
    [3723, 'Reprendre à 1:02:03'],
  ])('reprend à %s s : « %s »', (positionSeconds, label) => {
    expect(playAction({ state: 'STARTED', positionSeconds })).toEqual({ label, startAt: positionSeconds })
  })

  it('une progression commencée à 0 reste « Lecture »', () => {
    expect(playAction({ state: 'STARTED', positionSeconds: 0 })).toEqual({ label: 'Lecture', startAt: 0 })
  })

  it('propose « Revoir » depuis le début quand le film est terminé', () => {
    expect(playAction({ state: 'COMPLETED', positionSeconds: 590 })).toEqual({ label: 'Revoir', startAt: 0 })
  })
})
