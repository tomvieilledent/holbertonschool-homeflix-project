import { useCallback, useEffect, useMemo, useState } from 'react'
import { AuthContext } from '@/features/auth/authContext'
import { forgetProfile as forgetRememberedProfile } from '@/services/activeProfile'
import { onSessionExpired } from '@/services/api'
import { restoreSession, selectProfile as selectProfileRequest, signIn, signOut } from '@/services/auth'

const ANONYMOUS = { status: 'anonymous', account: null, activeProfileId: null, sessionExpired: false }

const authenticated = (me) => ({
  status: 'authenticated',
  account: me.account,
  activeProfileId: me.activeProfileId ?? null,
  sessionExpired: false,
})

/**
 * Fournit la session (`useAuth()`). Au démarrage, tente de rouvrir la session via le cookie de
 * rafraîchissement ; tant que la réponse n'est pas arrivée, `status` vaut `loading`.
 * Si le client d'API perd la session (refresh refusé), l'utilisateur redevient anonyme avec
 * `sessionExpired: true` : les gardes le redirigent vers `/login` avec un message.
 * @param {object} props
 * @param {React.ReactNode} props.children
 */
export default function AuthProvider({ children }) {
  const [session, setSession] = useState({ ...ANONYMOUS, status: 'loading' })

  useEffect(() => {
    let active = true
    restoreSession().then((me) => {
      if (active) setSession(me ? authenticated(me) : ANONYMOUS)
    })
    const unsubscribe = onSessionExpired(() => {
      if (active) setSession({ ...ANONYMOUS, sessionExpired: true })
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const login = useCallback(async (username, password) => {
    setSession(authenticated(await signIn(username, password)))
  }, [])

  const logout = useCallback(async () => {
    await signOut()
    setSession(ANONYMOUS)
  }, [])

  const selectProfile = useCallback(async (profileId) => {
    await selectProfileRequest(profileId)
    setSession((current) => ({ ...current, activeProfileId: profileId }))
  }, [])

  // Le profil actif vient d'être supprimé : il n'y en a plus d'actif tant qu'un autre n'est pas choisi.
  const forgetProfile = useCallback((profileId) => {
    forgetRememberedProfile() // sinon le prochain refresh ré-sélectionnerait ce profil supprimé
    setSession((current) =>
      current.activeProfileId === profileId ? { ...current, activeProfileId: null } : current,
    )
  }, [])

  const value = useMemo(
    () => ({ ...session, login, logout, selectProfile, forgetProfile }),
    [session, login, logout, selectProfile, forgetProfile],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
