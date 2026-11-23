import { useState } from 'react'
import Button from '@/components/Button'
import Modal from '@/components/Modal'

/**
 * Confirmation de suppression d'un profil. Prévient que ses favoris et sa progression seront perdus ; le focus
 * démarre sur « Annuler » pour qu'un Entrée distrait ne supprime rien.
 * `onConfirm()` lève une `ApiError` en cas d'échec ; en cas de succès, le parent ferme la modale.
 * @param {object} props
 * @param {{id: string, name: string}} props.profile
 * @param {() => Promise<void>} props.onConfirm
 * @param {() => void} props.onClose
 */
export default function DeleteProfileModal({ profile, onConfirm, onClose }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const confirm = async () => {
    setBusy(true)
    setError('')
    try {
      await onConfirm()
    } catch (failure) {
      setError(failure.message)
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Supprimer le profil « ${profile.name} » ?`}
      actions={
        <>
          <Button variant="secondary" data-autofocus onClick={onClose}>
            Annuler
          </Button>
          <Button variant="danger" loading={busy} onClick={confirm}>
            Supprimer le profil
          </Button>
        </>
      }
    >
      <p>
        Les favoris et la progression de lecture de ce profil seront supprimés définitivement. Cette action est
        irréversible.
      </p>
      {error && <p role="alert">{error}</p>}
    </Modal>
  )
}
