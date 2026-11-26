import { useId, useState } from 'react'
import Button from '@/components/Button'
import Field from '@/components/Field'
import Modal from '@/components/Modal'

/**
 * Confirmation de la suppression du compte : le mot de passe est obligatoire, et le bouton reste inactif tant qu'il est
 * vide. Le focus démarre sur le champ ; une erreur (mot de passe incorrect, dernier administrateur…) s'affiche sans
 * fermer la modale. `onConfirm(password)` lève une `ApiError` en cas d'échec ; en cas de succès, la session est fermée
 * par le parent.
 * @param {object} props
 * @param {(password: string) => Promise<void>} props.onConfirm
 * @param {() => void} props.onClose
 */
export default function DeleteAccountModal({ onConfirm, onClose }) {
  const formId = useId()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    if (!password || busy) return
    setBusy(true)
    setError('')
    try {
      await onConfirm(password)
    } catch (failure) {
      // Le message générique de la connexion parle d'« identifiant » : ici seul le mot de passe est en cause.
      setError(failure.code === 'AUTH_INVALID_CREDENTIALS' ? 'Mot de passe incorrect.' : failure.message)
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Supprimer mon compte ?"
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="danger" type="submit" form={formId} loading={busy} disabled={!password}>
            Supprimer définitivement
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate>
        <p>Pour confirmer, saisissez votre mot de passe. Cette action est irréversible.</p>
        <Field
          label="Mot de passe"
          type="password"
          name="password"
          required
          autoComplete="current-password"
          data-autofocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={error}
        />
      </form>
    </Modal>
  )
}
