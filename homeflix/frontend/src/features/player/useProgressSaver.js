import { useCallback, useEffect, useRef } from 'react'
import { saveProgress } from '@/services/library'

/** Intervalle entre deux sauvegardes pendant la lecture. */
export const SAVE_INTERVAL_MS = 10_000

/**
 * Sauvegarde la position de lecture du profil actif (`PUT /media/{id}/progress`).
 *
 * La position est envoyée toutes les 10 s pendant la lecture, puis immédiatement à la pause et à la fin, au
 * changement de page (démontage) et à la fermeture de l'onglet (`pagehide`, requête `keepalive`). Une position
 * déjà envoyée n'est jamais renvoyée. La sauvegarde est au mieux : un échec ne doit pas gêner le visionnage.
 *
 * @param {string} mediaId
 * @returns {{
 *   track: (position: number, duration: number, options?: {immediate?: boolean}) => void,
 *   discard: () => void,
 * }} `track` note la position courante (`immediate` : l'envoyer tout de suite) ; `discard` oublie la
 *   position en attente (avant « Recommencer »).
 */
export default function useProgressSaver(mediaId) {
  const pending = useRef(null) // dernière position pas encore envoyée

  const flush = useCallback(
    (keepalive = false) => {
      if (!pending.current) return
      const position = pending.current
      pending.current = null
      saveProgress(mediaId, position, { keepalive }).catch(() => {})
    },
    [mediaId],
  )

  useEffect(() => {
    const timer = setInterval(() => flush(), SAVE_INTERVAL_MS)
    const onHide = () => flush(true)
    window.addEventListener('pagehide', onHide)
    const onVisibility = () => document.visibilityState === 'hidden' && onHide()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(timer)
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onVisibility)
      flush(true) // changement de page : le composant disparaît, la dernière position part avec lui
    }
  }, [flush])

  const track = useCallback(
    (position, duration, { immediate = false } = {}) => {
      if (!Number.isFinite(position) || !Number.isFinite(duration) || duration < 1) return
      const durationSeconds = Math.floor(duration)
      pending.current = { positionSeconds: Math.min(Math.floor(position), durationSeconds), durationSeconds }
      if (immediate) flush()
    },
    [flush],
  )

  const discard = useCallback(() => {
    pending.current = null
  }, [])

  return { track, discard }
}
