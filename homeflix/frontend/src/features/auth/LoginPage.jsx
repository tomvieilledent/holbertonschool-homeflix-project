import { useLocation, useNavigate } from 'react-router-dom'
import PagePlaceholder from '@/components/PagePlaceholder'
import SessionExpiredNotice from '@/features/auth/SessionExpiredNotice'

export default function LoginPage() {
  const { state, pathname, search, hash } = useLocation()
  const navigate = useNavigate()

  if (state?.reason === 'session-expired') {
    // Même URL (donc `?next=`), sans l'état : l'écran d'expiration laisse place à la connexion.
    return (
      <SessionExpiredNotice
        onReconnect={() => navigate(`${pathname}${search}${hash}`, { replace: true })}
      />
    )
  }
  return <PagePlaceholder title="Connexion" />
}
