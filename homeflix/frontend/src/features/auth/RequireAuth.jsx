import { Navigate, Outlet, useLocation } from 'react-router-dom'
import Spinner from '@/components/Spinner'
import { useAuth } from '@/features/auth/authContext'
import { loginUrl } from '@/features/auth/redirect'

/**
 * Garde de route : un anonyme est redirigé vers `/login?next=<destination>`. À utiliser comme route
 * de mise en page. Si la session vient d'expirer, la redirection porte `state.reason = 'session-expired'`
 * pour que la page de connexion explique pourquoi.
 */
export default function RequireAuth() {
  const { status, sessionExpired } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <div className="session-loading">
        <Spinner size="lg" label="Vérification de votre session…" />
      </div>
    )
  }
  if (status === 'anonymous') {
    return (
      <Navigate
        to={loginUrl(location)}
        replace
        state={sessionExpired ? { reason: 'session-expired' } : undefined}
      />
    )
  }
  return <Outlet />
}
