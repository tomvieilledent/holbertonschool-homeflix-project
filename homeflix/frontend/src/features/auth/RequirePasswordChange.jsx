import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/features/auth/authContext'
import { PASSWORD_PATH, passwordUrl } from '@/features/auth/redirect'

/**
 * Garde de route (sous `RequireAuth`) : un compte au mot de passe temporaire (`mustChangePassword`) ne voit que
 * l'écran de changement, le serveur refusant tout le reste (403). La destination demandée est gardée.
 */
export default function RequirePasswordChange() {
  const { account } = useAuth()
  const location = useLocation()

  if (account?.mustChangePassword && location.pathname !== PASSWORD_PATH) {
    return <Navigate to={passwordUrl(location)} replace />
  }
  return <Outlet />
}
