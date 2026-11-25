import { useId, useState } from 'react'
import Button from '@/components/Button'
import Modal from '@/components/Modal'

/**
 * Rappel des droits, affiché avant le premier téléchargement : le texte du serveur (affiché comme du texte, jamais
 * comme du HTML), sa version, et une case à cocher obligatoire. Le bouton ne s'active qu'une fois la case cochée ;
 * accepter acquitte le rappel puis lance le téléchargement. Le focus démarre sur la case, pas sur le bouton.
 * `onAccept()` lève une erreur en cas d'échec : son message s'affiche ici et la case est décochée (il faut relire).
 * @param {object} props
 * @param {{version: string, text: string}} props.notice
 * @param {{title: string}} props.entry Contenu dont on veut lancer le téléchargement.
 * @param {() => Promise<void>} props.onAccept
 * @param {() => void} props.onClose
 */
export default function RightsModal({ notice, entry, onAccept, onClose }) {
  const checkId = useId()
  const [checked, setChecked] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const accept = async () => {
    setBusy(true)
    setError('')
    try {
      await onAccept()
    } catch (failure) {
      setError(failure.message)
      setChecked(false)
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Rappel des droits"
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button disabled={!checked} loading={busy} onClick={accept}>
            Accepter et télécharger
          </Button>
        </>
      }
    >
      <p>
        Avant de télécharger « {entry.title} », lisez ce rappel. Il n’est demandé qu’une fois (version{' '}
        {notice.version}).
      </p>
      <blockquote className="rights__text">{notice.text}</blockquote>
      <p className="rights__check">
        <input id={checkId} type="checkbox" checked={checked} data-autofocus onChange={(event) => setChecked(event.target.checked)} />{' '}
        <label htmlFor={checkId}>
          J’ai lu ce rappel et je ne télécharge que des contenus libres de droits ou dont je détiens les droits.
        </label>
      </p>
      {error && <p role="alert">{error}</p>}
    </Modal>
  )
}
