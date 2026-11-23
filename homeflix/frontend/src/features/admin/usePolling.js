import { useCallback, useEffect, useState } from 'react'
import { isAbortError } from '@/services/api'

/**
 * Charge une ressource, puis la consulte à intervalle régulier **tant qu'elle est active** (un scan qui tourne, un
 * téléchargement en cours) : le suivi s'arrête de lui-même quand plus rien n'est actif, au démontage, et après
 * `maxFailures` échecs consécutifs (`stalled`, réessayable avec `resume`). Une consultation à la fois : la suivante
 * n'est programmée qu'une fois la réponse (ou l'échec) reçue. `reload` relit tout de suite et relance le suivi.
 *
 * @template T
 * @param {object} options
 * @param {(signal?: AbortSignal) => Promise<T>} options.fetch Lecture ; doit être stable (module ou `useCallback`).
 * @param {(data: T) => boolean} options.isActive Fonction pure : vraie tant que la ressource évolue et mérite d'être suivie.
 * @param {number} options.intervalMs Délai entre deux consultations.
 * @param {number} options.maxFailures Échecs consécutifs avant d'interrompre le suivi.
 * @returns {{
 *   data: T|null,
 *   setData: (data: T) => void,
 *   loadError: Error|null,
 *   stalled: boolean,
 *   resume: () => void,
 *   reload: () => Promise<void>,
 * }} `data` vaut `null` pendant le premier chargement ; `loadError` est l'erreur du premier chargement.
 */
export default function usePolling({ fetch, isActive, intervalMs, maxFailures }) {
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [failures, setFailures] = useState(0)

  // Premier état.
  useEffect(() => {
    const controller = new AbortController()
    fetch(controller.signal)
      .then(setData)
      .catch((error) => {
        if (!isAbortError(error)) setLoadError(error)
      })
    return () => controller.abort()
  }, [fetch])

  const active = data !== null && isActive(data)
  const polling = active && failures < maxFailures

  // Consultation périodique, rechaînée après chaque réponse (`data`) ou échec (`failures`).
  useEffect(() => {
    if (!polling) return undefined
    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetch(controller.signal)
        .then((next) => {
          setFailures(0)
          setData(next)
        })
        .catch((error) => {
          if (!isAbortError(error)) setFailures((count) => count + 1)
        })
    }, intervalMs)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [polling, data, failures, fetch, intervalMs])

  const resume = useCallback(() => setFailures(0), [])

  const reload = useCallback(async () => {
    setFailures(0)
    setData(await fetch())
  }, [fetch])

  return { data, setData, loadError, stalled: active && failures >= maxFailures, resume, reload }
}
