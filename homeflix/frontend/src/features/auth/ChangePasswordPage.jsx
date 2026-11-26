import { useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import Button from '@/components/Button'
import Field from '@/components/Field'
import '@/features/auth/AuthForm.css'
import { useAuth } from '@/features/auth/authContext'
import { PASSWORD_PATH, safeNext } from '@/features/auth/redirect'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, validatePasswordChange } from '@/features/auth/setupValidation'

const EMPTY = { currentPassword: '', newPassword: '', confirmation: '' }

/** Où poser le message d'un échec : sur le champ en cause, sinon pour tout le formulaire. */
function serverErrors(error) {
  if (error.code === 'INVALID_CURRENT_PASSWORD') return { fields: { currentPassword: error.message }, form: '' }
  const fields = error.fieldErrors ?? {}
  return Object.keys(fields).length > 0 ? { fields, form: '' } : { fields: {}, form: error.message }
}

/**
 * Remplacement obligatoire d'un mot de passe temporaire (après une réinitialisation par un administrateur) : tant
 * qu'il n'est pas changé, le serveur refuse toutes les autres routes et la garde `RequirePasswordChange` ramène ici.
 * Seule autre issue : se déconnecter. Une fois le mot de passe changé, on reprend la destination demandée.
 */
export default function ChangePasswordPage() {
  const { account, changePassword, logout } = useAuth()
  const [params] = useSearchParams()
  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const next = safeNext(params.get('next'))
  // Rien à changer (ou changement réussi) : on repart. Jamais vers cette page elle-même.
  if (!account?.mustChangePassword) return <Navigate to={next.startsWith(PASSWORD_PATH) ? '/' : next} replace />

  const onChange = (event) => setValues((current) => ({ ...current, [event.target.name]: event.target.value }))

  const onSubmit = async (event) => {
    event.preventDefault()
    if (submitting) return
    setFormError('')
    const found = validatePasswordChange(values)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    setSubmitting(true)
    try {
      await changePassword(values.currentPassword, values.newPassword)
    } catch (failure) {
      const { fields, form } = serverErrors(failure)
      setErrors(fields)
      setFormError(form)
      setSubmitting(false)
    }
  }

  const field = (name, label, autoComplete, hint) => (
    <Field
      label={label}
      name={name}
      type="password"
      required
      autoComplete={autoComplete}
      maxLength={PASSWORD_MAX_LENGTH}
      hint={hint}
      error={errors[name]}
      value={values[name]}
      readOnly={submitting}
      onChange={onChange}
    />
  )

  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate>
      <h1>Choisissez un nouveau mot de passe</h1>
      <p>
        Votre mot de passe est temporaire. Remplacez-le pour continuer à utiliser Homeflix. Vos autres sessions seront
        fermées.
      </p>
      {formError && (
        <p className="auth-form__error" role="alert">
          {formError}
        </p>
      )}
      {field('currentPassword', 'Mot de passe temporaire', 'current-password')}
      {field('newPassword', 'Nouveau mot de passe', 'new-password', `${PASSWORD_MIN_LENGTH} caractères minimum.`)}
      {field('confirmation', 'Confirmer le nouveau mot de passe', 'new-password')}
      <Button type="submit" loading={submitting}>
        Changer le mot de passe
      </Button>
      <Button variant="ghost" onClick={logout} busy={submitting}>
        Se déconnecter
      </Button>
    </form>
  )
}
