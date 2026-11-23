import { useId, useState } from 'react'
import Button from '@/components/Button'
import Field from '@/components/Field'
import Modal from '@/components/Modal'
import { PASSWORD_MAX_LENGTH, passwordError } from '@/features/auth/setupValidation'

/**
 * Réinitialisation du mot de passe d'un compte : l'administrateur définit un mot de passe temporaire (visible, pour
 * pouvoir le communiquer). Le serveur marque alors le compte `mustChangePassword`.
 * `onSubmit(temporaryPassword)` lève une `ApiError` en cas d'échec ; en cas de succès, le parent ferme la modale.
 * @param {object} props
 * @param {{username: string}} props.account
 * @param {(temporaryPassword: string) => Promise<void>} props.onSubmit
 * @param {() => void} props.onClose
 */
export default function ResetPasswordModal({ account, onSubmit, onClose }) {
  const formId = useId()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    const problem = passwordError(password)
    setError(problem)
    setFormError('')
    if (problem) return
    setBusy(true)
    try {
      await onSubmit(password)
    } catch (failure) {
      const fieldMessage = failure.fieldErrors?.temporaryPassword
      if (fieldMessage) setError(fieldMessage)
      else setFormError(failure.message)
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Réinitialiser le mot de passe de « ${account.username} »`}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form={formId} loading={busy}>
            Réinitialiser
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate>
        <p>Le compte sera marqué « mot de passe temporaire ». Communiquez-lui ce nouveau mot de passe.</p>
        <Field
          label="Mot de passe temporaire"
          required
          value={password}
          maxLength={PASSWORD_MAX_LENGTH}
          hint="12 caractères minimum. Affiché pour que vous puissiez le communiquer."
          error={error}
          autoComplete="off"
          spellCheck={false}
          data-autofocus
          onChange={(event) => setPassword(event.target.value)}
        />
        {formError && <p role="alert">{formError}</p>}
      </form>
    </Modal>
  )
}
