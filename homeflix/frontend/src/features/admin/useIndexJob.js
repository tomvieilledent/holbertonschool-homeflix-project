import { useCallback, useEffect, useState } from 'react'
import { ApiError, isAbortError } from '@/services/api'
import { getIndexStatus, startIndexing } from '@/services/library'

/** Intervalle entre deux consultations de l'état pendant un scan. */
export const POLL_INTERVAL_MS = 2000
/** Échecs consécutifs de consultation après lesquels le suivi s'interrompt (réessayable). */
export const MAX_POLL_FAILURES = 3

/**
 * Suivi de l'indexation : charge l'état au montage, puis le consulte toutes les 2 s tant qu'un scan tourne (y compris
 * un scan lancé ailleurs ou avant un rechargement). Le suivi s'arrête à la fin du scan, au démontage, et après trois
 * échecs consécutifs de consultation (`stalled`) ; `resume` le relance.
 * @returns {{
 *   job: object|null,
 *   loadError: Error|null,
 *   starting: boolean,
 *   startError: string,
 *   stalled: boolean,
 *   running: boolean,
 *   start: () => Promise<void>,
 *   resume: () => void,
 * }} `job` vaut `null` pendant le premier chargement ; `running` est vrai pendant un scan ou le lancement d'un scan.
 */
export default function useIndexJob() {
  const [job, setJob] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState('')
  const [failures, setFailures] = useState(0)

  // Premier état.
  useEffect(() => {
    const controller = new AbortController()
    getIndexStatus(controller.signal)
      .then(setJob)
      .catch((error) => {
        if (!isAbortError(error)) setLoadError(error)
      })
    return () => controller.abort()
  }, [])

  const polling = job?.state === 'RUNNING' && failures < MAX_POLL_FAILURES

  // Consultation périodique : une à la fois, rechaînée après chaque réponse (`job`) ou échec (`failures`).
  useEffect(() => {
    if (!polling) return undefined
    const controller = new AbortController()
    const timer = setTimeout(() => {
      getIndexStatus(controller.signal)
        .then((next) => {
          setFailures(0)
          setJob(next)
        })
        .catch((error) => {
          if (!isAbortError(error)) setFailures((count) => count + 1)
        })
    }, POLL_INTERVAL_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [polling, job, failures])

  const start = useCallback(async () => {
    setStarting(true)
    setStartError('')
    setFailures(0)
    try {
      setJob(await startIndexing())
    } catch (error) {
      if (error instanceof ApiError && error.code === 'INDEX_ALREADY_RUNNING') {
        // Un scan tourne déjà : on le suit au lieu d'afficher une erreur.
        try {
          setJob(await getIndexStatus())
        } catch (statusError) {
          setStartError(statusError.message)
        }
      } else {
        setStartError(error.message)
      }
    } finally {
      setStarting(false)
    }
  }, [])

  const resume = useCallback(() => setFailures(0), [])

  return {
    job,
    loadError,
    starting,
    startError,
    stalled: job?.state === 'RUNNING' && failures >= MAX_POLL_FAILURES,
    running: starting || job?.state === 'RUNNING',
    start,
    resume,
  }
}
