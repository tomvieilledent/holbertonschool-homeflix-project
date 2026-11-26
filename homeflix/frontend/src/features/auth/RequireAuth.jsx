import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import Spinner from '@/components/Spinner'
import { useAuth } from '@/features/auth/authContext'
import { loginUrl } from '@/features/auth/redirect'
import RequirePasswordChange from '@/features/auth/RequirePasswordChange'

/**
 * Garde de route : un anonyme est redirigé vers `/login?next=<destination>`. À utiliser comme route
 * de mise en page. Si la session vient d'expirer, la redirection porte `state.reason = 'session-expired'`
 * pour que la page de connexion explique pourquoi ; de même après la suppression du compte (`account-deleted`) ou sa
 * désactivation (`account-disabled`). Quand l'utilisateur se déconnecte depuis la page affichée, elle mène à `/login`
 * sans destination ni message.
 */
export default function RequireAuth() {
  const { status, sessionExpired, accountDisabled, accountDeleted, signedOut } = useAuth()
  const location = useLocation()
  // Une garde ouverte après la déconnexion (adresse protégée, bouton « Précédent ») garde, elle, la destination.
  const [openedSignedOut] = useState(signedOut)
  const leaving = signedOut && !openedSignedOut

  if (status === 'loading') {
    return (
      <div className="session-loading">
        <Spinner size="lg" label="Vérification de votre session…" />
      </div>
    )
  }
  if (status === 'anonymous' && (accountDeleted || accountDisabled || leaving)) {
    // Compte supprimé ou désactivé, ou déconnexion : pas de `?next=` (la page quittée n'a plus de sens, et la
    // personne qui se connecte ensuite n'a pas à y être conduite).
    const reason = (accountDeleted && 'account-deleted') || (accountDisabled && 'account-disabled')
    return <Navigate to="/login" replace state={reason ? { reason } : undefined} />
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
