import { useEffect, useState } from 'react'
import { fetchSetupRequired } from '@/services/setup'

/**
 * `true` quand le serveur dit qu'aucun administrateur n'existe encore. Au mieux : tant que la réponse manque, ou si
 * la requête échoue, `false` (la connexion reste affichée).
 * @param {boolean} enabled Ne poser la question que pour un visiteur anonyme.
 */
export default function useSetupRequired(enabled) {
  const [required, setRequired] = useState(false)

  useEffect(() => {
    if (!enabled) return undefined
    const controller = new AbortController()
    fetchSetupRequired(controller.signal)
      .then((value) => setRequired(value === true))
      .catch(() => {})
    return () => controller.abort()
  }, [enabled])

  return required
}
