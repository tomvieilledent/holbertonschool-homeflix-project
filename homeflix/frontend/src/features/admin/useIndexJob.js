import { useCallback, useState } from 'react'
import usePolling from '@/features/admin/usePolling'
import { ApiError } from '@/services/api'
import { getIndexStatus, startIndexing } from '@/services/library'

/** Intervalle entre deux consultations de l'état pendant un scan. */
export const POLL_INTERVAL_MS = 2000
/** Échecs consécutifs de consultation après lesquels le suivi s'interrompt (réessayable). */
export const MAX_POLL_FAILURES = 3

const isRunning = (job) => job.state === 'RUNNING'

/**
 * Suivi de l'indexation : charge l'état au montage, puis le consulte toutes les 2 s tant qu'un scan tourne (y compris
 * un scan lancé ailleurs ou avant un rechargement) ; voir `usePolling` pour l'arrêt et la reprise du suivi.
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
  const {
    data: job,
    setData: setJob,
    loadError,
    stalled,
    resume,
  } = usePolling({ fetch: getIndexStatus, isActive: isRunning, intervalMs: POLL_INTERVAL_MS, maxFailures: MAX_POLL_FAILURES })
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState('')

  const start = useCallback(async () => {
    setStarting(true)
    setStartError('')
    resume()
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
  }, [resume, setJob])

  return {
    job,
    loadError,
    starting,
    startError,
    stalled,
    running: starting || job?.state === 'RUNNING',
    start,
    resume,
  }
}
