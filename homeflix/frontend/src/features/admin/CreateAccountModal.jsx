import { useId, useState } from 'react'
import Button from '@/components/Button'
import Field from '@/components/Field'
import Modal from '@/components/Modal'
import Select from '@/components/Select'
import { PASSWORD_MAX_LENGTH, passwordError } from '@/features/auth/setupValidation'

const ROLE_OPTIONS = [
  { value: 'USER', label: 'Utilisateur' },
  { value: 'ADMIN', label: 'Administrateur' },
]

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Erreurs de saisie (le serveur reste l'autorité). `{ champ: message }`, vide si tout est valide. */
function validate({ username, email, password }) {
  const errors = {}
  if (username.trim().length < 3 || username.trim().length > 40) {
    errors.username = 'L’identifiant doit contenir entre 3 et 40 caractères.'
  }
  if (!EMAIL.test(email.trim())) errors.email = 'Saisissez une adresse e-mail valide.'
  const problem = passwordError(password)
  if (problem) errors.password = problem
  return errors
}

/**
 * Formulaire accessible de création d'un compte, dans une modale. Le mot de passe initial est affiché, pour que
 * l'administrateur puisse le communiquer à l'utilisateur.
 * `onSubmit(account)` lève une `ApiError` en cas d'échec ; en cas de succès, le parent ferme la modale.
 * @param {object} props
 * @param {(account: {username: string, email: string, password: string, role: string}) => Promise<void>} props.onSubmit
 * @param {() => void} props.onClose
 */
export default function CreateAccountModal({ onSubmit, onClose }) {
  const formId = useId()
  const [values, setValues] = useState({ username: '', email: '', password: '', role: 'USER' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  const change = (name) => (event) => setValues((current) => ({ ...current, [name]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    const problems = validate(values)
    setErrors(problems)
    setFormError('')
    if (Object.keys(problems).length > 0) return
    setBusy(true)
    try {
      await onSubmit({ ...values, username: values.username.trim(), email: values.email.trim() })
    } catch (failure) {
      if (failure.code === 'CONFLICT') {
        setFormError('Cet identifiant ou cette adresse e-mail est déjà utilisé.')
      } else if (Object.keys(failure.fieldErrors ?? {}).length > 0) {
        setErrors(failure.fieldErrors)
      } else {
        setFormError(failure.message)
      }
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Créer un compte"
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form={formId} loading={busy}>
            Créer le compte
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate>
        <Field
          label="Identifiant"
          required
          value={values.username}
          maxLength={40}
          hint="3 à 40 caractères."
          error={errors.username}
          autoComplete="off"
          data-autofocus
          onChange={change('username')}
        />
        <Field
          label="Adresse e-mail"
          type="email"
          required
          value={values.email}
          error={errors.email}
          autoComplete="off"
          onChange={change('email')}
        />
        <Field
          label="Mot de passe"
          required
          value={values.password}
          maxLength={PASSWORD_MAX_LENGTH}
          hint="12 caractères minimum. Affiché pour que vous puissiez le communiquer à l’utilisateur."
          error={errors.password}
          autoComplete="off"
          spellCheck={false}
          onChange={change('password')}
        />
        <Select
          label="Rôle"
          options={ROLE_OPTIONS}
          value={values.role}
          onChange={(role) => setValues((current) => ({ ...current, role }))}
        />
        {formError && <p role="alert">{formError}</p>}
      </form>
    </Modal>
  )
}
