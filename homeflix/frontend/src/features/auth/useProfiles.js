import { useCallback, useEffect, useState } from 'react'
import { isAbortError } from '@/services/api'
import { listProfiles } from '@/services/profiles'

/**
 * Charge les profils du compte (`GET /profiles`) au montage.
 * @returns {{
 *   profiles: {id: string, name: string, avatar: string, createdAt: string}[]|null,
 *   setProfiles: React.Dispatch<React.SetStateAction<object[]|null>>,
 *   loadFailed: boolean,
 *   reload: () => void,
 * }} `profiles` vaut `null` pendant le chargement ; `setProfiles` sert à refléter une création, un changement
 *   de nom ou une suppression sans recharger la liste.
 */
export default function useProfiles() {
  const [profiles, setProfiles] = useState(null)
  const [loadFailed, setLoadFailed] = useState(false)

  const load = useCallback((signal) => {
    setLoadFailed(false)
    listProfiles(signal)
      .then(setProfiles)
      .catch((error) => {
        if (!isAbortError(error)) setLoadFailed(true)
      })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  return { profiles, setProfiles, loadFailed, reload: () => load() }
}
