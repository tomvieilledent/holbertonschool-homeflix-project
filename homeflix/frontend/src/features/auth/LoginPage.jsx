import { useState } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import Button from '@/components/Button'
import Field from '@/components/Field'
import Spinner from '@/components/Spinner'
import '@/features/auth/AuthForm.css'
import { useAuth } from '@/features/auth/authContext'
import { safeNext } from '@/features/auth/redirect'
import SessionExpiredNotice from '@/features/auth/SessionExpiredNotice'

/** Message d'échec de connexion : le 401 reste générique (rien sur l'existence du compte). */
const failureMessage = (error) =>
  error?.status === 429 && error.retryAfter
    ? `${error.message} Réessayez dans ${error.retryAfter} s.`
    : (error?.message ?? 'Connexion impossible. Réessayez.')

export default function LoginPage() {
  const { status, login } = useAuth()
  const { state, pathname, search, hash } = useLocation()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const next = safeNext(params.get('next'))

  if (status === 'loading') return <Spinner size="lg" label="Vérification de votre session…" />
  if (status === 'authenticated' && !submitting) return <Navigate to={next} replace />

  if (state?.reason === 'session-expired') {
    // Même URL (donc `?next=`), sans l'état : l'écran d'expiration laisse place à la connexion.
    return (
      <SessionExpiredNotice
        onReconnect={() => navigate(`${pathname}${search}${hash}`, { replace: true })}
      />
    )
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    if (submitting) return
    if (!username.trim() || !password) {
      setError('Saisissez votre identifiant et votre mot de passe.')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      await login(username.trim(), password)
      navigate(next, { replace: true })
    } catch (failure) {
      setError(failureMessage(failure))
      setPassword('')
      setSubmitting(false)
    }
  }

  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate>
      <h1>Connexion</h1>
      {state?.reason === 'setup-done' && (
        <p role="status">Administrateur créé. Connectez-vous pour continuer.</p>
      )}
      {state?.reason === 'account-deleted' && (
        <p role="status">Votre compte et ses données ont été supprimés.</p>
      )}
      {error && (
        <p className="auth-form__error" role="alert">
          {error}
        </p>
      )}
      <Field
        label="Identifiant"
        name="username"
        required
        autoComplete="username"
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        disabled={submitting}
      />
      <Field
        label="Mot de passe"
        name="password"
        type="password"
        required
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        disabled={submitting}
      />
      <Button type="submit" loading={submitting} disabled={submitting}>
        Se connecter
      </Button>
    </form>
  )
}
