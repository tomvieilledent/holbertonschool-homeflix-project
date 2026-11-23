import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import useProgressSaver, { SAVE_INTERVAL_MS } from '@/features/player/useProgressSaver'
import { saveProgress } from '@/services/library'

vi.mock('@/services/library', () => ({ saveProgress: vi.fn(() => Promise.resolve({})) }))

const ID = 'media-1'

describe('useProgressSaver', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    saveProgress.mockClear()
  })
  afterEach(() => vi.useRealTimers())

  it('envoie la position toutes les 10 s, sans renvoyer une position déjà envoyée', () => {
    const { result } = renderHook(() => useProgressSaver(ID))
    act(() => result.current.track(12.7, 600.4))
    expect(saveProgress).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(SAVE_INTERVAL_MS))
    expect(saveProgress).toHaveBeenCalledTimes(1)
    expect(saveProgress).toHaveBeenCalledWith(ID, { positionSeconds: 12, durationSeconds: 600 }, { keepalive: false })

    act(() => vi.advanceTimersByTime(SAVE_INTERVAL_MS)) // rien de nouveau : pas de requête
    expect(saveProgress).toHaveBeenCalledTimes(1)

    act(() => result.current.track(25, 600))
    act(() => vi.advanceTimersByTime(SAVE_INTERVAL_MS))
    expect(saveProgress).toHaveBeenCalledTimes(2)
    expect(saveProgress).toHaveBeenLastCalledWith(ID, { positionSeconds: 25, durationSeconds: 600 }, { keepalive: false })
  })

  it('envoie tout de suite à la pause (immediate)', () => {
    const { result } = renderHook(() => useProgressSaver(ID))
    act(() => result.current.track(40, 600, { immediate: true }))
    expect(saveProgress).toHaveBeenCalledWith(ID, { positionSeconds: 40, durationSeconds: 600 }, { keepalive: false })
  })

  it('envoie en keepalive à la fermeture de l’onglet', () => {
    const { result } = renderHook(() => useProgressSaver(ID))
    act(() => result.current.track(70, 600))
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })
    expect(saveProgress).toHaveBeenCalledWith(ID, { positionSeconds: 70, durationSeconds: 600 }, { keepalive: true })
  })

  it('envoie la dernière position au changement de page (démontage)', () => {
    const { result, unmount } = renderHook(() => useProgressSaver(ID))
    act(() => result.current.track(95, 600))
    unmount()
    expect(saveProgress).toHaveBeenCalledWith(ID, { positionSeconds: 95, durationSeconds: 600 }, { keepalive: true })
  })

  it('ne dépasse pas la durée et ignore une durée inconnue', () => {
    const { result } = renderHook(() => useProgressSaver(ID))
    act(() => result.current.track(10, NaN))
    act(() => result.current.track(10, 0))
    act(() => vi.advanceTimersByTime(SAVE_INTERVAL_MS))
    expect(saveProgress).not.toHaveBeenCalled()

    act(() => result.current.track(601, 600, { immediate: true }))
    expect(saveProgress).toHaveBeenCalledWith(ID, { positionSeconds: 600, durationSeconds: 600 }, { keepalive: false })
  })

  it('oublie la position en attente après discard (« Recommencer »)', () => {
    const { result, unmount } = renderHook(() => useProgressSaver(ID))
    act(() => result.current.track(300, 600))
    act(() => result.current.discard())
    act(() => vi.advanceTimersByTime(SAVE_INTERVAL_MS))
    unmount()
    expect(saveProgress).not.toHaveBeenCalled()
  })

  it('ne remonte pas l’échec d’une sauvegarde', async () => {
    saveProgress.mockRejectedValueOnce(new Error('réseau'))
    const { result } = renderHook(() => useProgressSaver(ID))
    act(() => result.current.track(5, 600, { immediate: true }))
    await Promise.resolve()
    expect(saveProgress).toHaveBeenCalledTimes(1)
  })
})
