import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import useDebouncedValue from '@/hooks/useDebouncedValue'

describe('useDebouncedValue', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('garde la valeur initiale tout de suite', () => {
    const { result } = renderHook(() => useDebouncedValue('a', 300))
    expect(result.current).toBe('a')
  })

  it('ne suit la valeur qu’après le délai sans changement', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'a' },
    })
    rerender({ value: 'ab' })
    act(() => vi.advanceTimersByTime(299))
    expect(result.current).toBe('a')
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe('ab')
  })

  it('repart de zéro à chaque changement (une seule mise à jour pour une rafale)', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: '' },
    })
    for (const value of ['s', 'si', 'sin']) {
      rerender({ value })
      act(() => vi.advanceTimersByTime(200))
    }
    expect(result.current).toBe('') // jamais 300 ms sans frappe
    act(() => vi.advanceTimersByTime(300))
    expect(result.current).toBe('sin')
  })
})
