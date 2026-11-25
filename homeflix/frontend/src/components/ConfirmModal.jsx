import { useState } from 'react'
import Button from '@/components/Button'
import Modal from '@/components/Modal'

/**
 * Confirmation d'une action sensible, dans une modale. Le focus démarre sur « Annuler » pour qu'un Entrée distrait
 * ne confirme rien. `onConfirm()` lève une `ApiError` en cas d'échec : son message s'affiche dans la modale, qui
 * reste ouverte ; en cas de succès, le parent la ferme.
 * @param {object} props
 * @param {string} props.title Titre (nom accessible de la boîte de dialogue).
 * @param {React.ReactNode} props.children Explication des conséquences.
 * @param {string} props.confirmLabel Libellé du bouton de confirmation.
 * @param {'danger'|'primary'} [props.variant] `danger` par défaut (suppression, désactivation).
 * @param {() => Promise<void>} props.onConfirm
 * @param {() => void} props.onClose
 */
export default function ConfirmModal({ title, children, confirmLabel, variant = 'danger', onConfirm, onClose }) {
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
      title={title}
      actions={
        <>
          <Button variant="secondary" data-autofocus onClick={onClose}>
            Annuler
          </Button>
          <Button variant={variant} loading={busy} onClick={confirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {error && <p role="alert">{error}</p>}
    </Modal>
  )
}
