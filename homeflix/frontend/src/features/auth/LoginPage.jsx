import { useLocation } from 'react-router-dom'
import PagePlaceholder from '@/components/PagePlaceholder'
import { userMessage } from '@/services/errorMessages'

export default function LoginPage() {
  const { state } = useLocation()

  return (
    <>
      {state?.reason === 'session-expired' && <p role="status">{userMessage('SESSION_EXPIRED')}</p>}
      <PagePlaceholder title="Connexion" />
    </>
  )
}
