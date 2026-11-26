import { Navigate, useLocation } from 'react-router-dom'
import Spinner from '@/components/Spinner'
import { useAuth } from '@/features/auth/authContext'
import { loginUrl } from '@/features/auth/redirect'
import RequirePasswordChange from '@/features/auth/RequirePasswordChange'

/**
 * Garde de route : un anonyme est redirigé vers `/login?next=<destination>`. À utiliser comme route
 * de mise en page. Si la session vient d'expirer, la redirection porte `state.reason = 'session-expired'`
 * pour que la page de connexion explique pourquoi ; de même après la suppression du compte (`account-deleted`) ou sa
 * désactivation (`account-disabled`).
 */
export default function RequireAuth() {
  const { status, sessionExpired, accountDisabled, accountDeleted } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <div className="session-loading">
        <Spinner size="lg" label="Vérification de votre session…" />
      </div>
    )
  }
  if (status === 'anonymous' && (accountDeleted || accountDisabled)) {
    // Compte supprimé ou désactivé : pas de `?next=` (la page demandée n'a plus de sens), seulement l'explication.
    const reason = accountDeleted ? 'account-deleted' : 'account-disabled'
    return <Navigate to="/login" replace state={{ reason }} />
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
  return <RequirePasswordChange />
}
