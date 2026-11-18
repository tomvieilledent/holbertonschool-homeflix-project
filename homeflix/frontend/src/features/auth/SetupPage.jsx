import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import Button from '@/components/Button'
import ErrorState from '@/components/ErrorState'
import Field from '@/components/Field'
import Spinner from '@/components/Spinner'
import { validateSetup } from '@/features/auth/setupValidation'
import { isAbortError } from '@/services/api'
import { createFirstAdmin, fetchSetupRequired } from '@/services/setup'

const EMPTY = { setupToken: '', username: '', email: '', password: '', confirmation: '' }

/**
 * Première configuration : créer l'administrateur. N'est accessible que si le serveur indique
 * qu'aucun administrateur n'existe ; sinon (ou une fois créé) on est renvoyé vers la connexion.
 */
export default function SetupPage() {
  const navigate = useNavigate()
  const [required, setRequired] = useState(null) // null = vérification en cours
  const [statusError, setStatusError] = useState(false)
  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const checkStatus = (signal) => {
    setStatusError(false)
    fetchSetupRequired(signal)
      .then(setRequired)
      .catch((error) => {
        if (!isAbortError(error)) setStatusError(true)
      })
  }

  useEffect(() => {
    const controller = new AbortController()
    checkStatus(controller.signal)
    return () => controller.abort()
  }, [])

  const onChange = (event) => setValues((v) => ({ ...v, [event.target.name]: event.target.value }))

  const onSubmit = async (event) => {
    event.preventDefault()
    setFormError('')
    const found = validateSetup(values)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setSubmitting(true)
    try {
      await createFirstAdmin({
        setupToken: values.setupToken.trim(),
        username: values.username.trim(),
        email: values.email.trim(),
        password: values.password,
      })
      navigate('/login', { replace: true, state: { reason: 'setup-done' } })
    } catch (error) {
      if (error.code === 'SETUP_ALREADY_DONE') {
        navigate('/login', { replace: true })
        return
      }
      setErrors(error.fieldErrors ?? {})
      setFormError(error.message)
      setSubmitting(false)
    }
  }

  if (statusError) {
    return <ErrorState onRetry={() => checkStatus()} />
  }
  if (required === null) {
    return <Spinner size="lg" label="Vérification de l’installation…" />
  }
  if (!required) return <Navigate to="/login" replace />

  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate>
      <h1>Première configuration</h1>
      <p>Créez le compte administrateur de votre Homeflix.</p>
      {formError && <p role="alert">{formError}</p>}
      <Field
        label="Code d’installation"
        name="setupToken"
        required
        autoComplete="off"
        value={values.setupToken}
        onChange={onChange}
        error={errors.setupToken}
        hint="Valeur de SETUP_TOKEN dans le fichier .env, ou affichée dans les journaux du service Identity."
      />
      <Field
        label="Identifiant"
        name="username"
        required
        autoComplete="username"
        value={values.username}
        onChange={onChange}
        error={errors.username}
      />
      <Field
        label="Adresse e-mail"
        name="email"
        type="email"
        required
        autoComplete="email"
        value={values.email}
        onChange={onChange}
        error={errors.email}
      />
      <Field
        label="Mot de passe"
        name="password"
        type="password"
        required
        autoComplete="new-password"
        value={values.password}
        onChange={onChange}
        error={errors.password}
        hint="12 caractères minimum."
      />
      <Field
        label="Confirmer le mot de passe"
        name="confirmation"
        type="password"
        required
        autoComplete="new-password"
        value={values.confirmation}
        onChange={onChange}
        error={errors.confirmation}
      />
      <Button type="submit" loading={submitting}>
        Créer l’administrateur
      </Button>
    </form>
  )
}
