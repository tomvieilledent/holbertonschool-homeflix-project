import { useCallback, useEffect, useMemo, useState } from 'react'
import { AuthContext } from '@/features/auth/authContext'
import { restoreSession, signIn, signOut } from '@/services/auth'

const ANONYMOUS = { status: 'anonymous', account: null, activeProfileId: null }

const authenticated = (me) => ({
  status: 'authenticated',
  account: me.account,
  activeProfileId: me.activeProfileId ?? null,
})

/**
 * Fournit la session (`useAuth()`). Au démarrage, tente de rouvrir la session via le cookie de
 * rafraîchissement ; tant que la réponse n'est pas arrivée, `status` vaut `loading`.
 * @param {object} props
 * @param {React.ReactNode} props.children
 */
export default function AuthProvider({ children }) {
  const [session, setSession] = useState({ status: 'loading', account: null, activeProfileId: null })

  useEffect(() => {
    let active = true
    restoreSession().then((me) => {
      if (active) setSession(me ? authenticated(me) : ANONYMOUS)
    })
    return () => {
      active = false
    }
  }, [])

  const login = useCallback(async (username, password) => {
    setSession(authenticated(await signIn(username, password)))
  }, [])

  const logout = useCallback(async () => {
    await signOut()
    setSession(ANONYMOUS)
  }, [])

  const value = useMemo(() => ({ ...session, login, logout }), [session, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
