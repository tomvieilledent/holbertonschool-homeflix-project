import { useId, useState } from 'react'
import Button from '@/components/Button'
import Field from '@/components/Field'
import Modal from '@/components/Modal'

export const NAME_MAX_LENGTH = 30

/** Erreur du formulaire : sur le champ « nom » (invalide, déjà utilisé) ou, sinon, pour tout le formulaire. */
function errorMessages(error) {
  if (!error) return { name: '', form: '' }
  if (error.fieldErrors?.name) return { name: error.fieldErrors.name, form: '' }
  if (error.code === 'CONFLICT') return { name: 'Un profil porte déjà ce nom dans ce compte.', form: '' }
  return { name: '', form: error.message }
}

/**
 * Formulaire accessible de création (sans `profile`) ou de renommage d'un profil, dans une modale.
 * `onSubmit(name)` reçoit le nom nettoyé et lève une `ApiError` en cas d'échec ; en cas de succès, le parent
 * ferme la modale.
 * @param {object} props
 * @param {{id: string, name: string}} [props.profile] Profil à renommer ; absent pour une création.
 * @param {(name: string) => Promise<void>} props.onSubmit
 * @param {() => void} props.onClose
 */
export default function ProfileFormModal({ profile, onSubmit, onClose }) {
  const formId = useId()
  const [name, setName] = useState(profile?.name ?? '')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const creating = !profile
  const { name: nameError, form: formError } = errorMessages(error)

  const submit = async (event) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError({ fieldErrors: { name: 'Le nom du profil est obligatoire.' } })
      return
    }
    if (!creating && trimmed === profile.name) {
      onClose() // rien à changer
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSubmit(trimmed)
    } catch (failure) {
      setError(failure)
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={creating ? 'Ajouter un profil' : 'Renommer le profil'}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form={formId} loading={busy}>
            {creating ? 'Créer le profil' : 'Enregistrer'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate>
        <Field
          label="Nom du profil"
          required
          value={name}
          maxLength={NAME_MAX_LENGTH}
          hint={`${NAME_MAX_LENGTH} caractères maximum.`}
          error={nameError}
          autoComplete="off"
          data-autofocus
          onChange={(event) => setName(event.target.value)}
        />
        {formError && <p role="alert">{formError}</p>}
      </form>
    </Modal>
  )
}
