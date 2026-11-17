import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import './Modal.css'

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

/**
 * Boîte de dialogue modale : `role="dialog"`, piège de focus, fermeture par Échap ou clic sur le fond,
 * focus rendu à l'élément déclencheur à la fermeture.
 * @param {object} props
 * @param {boolean} props.open Affiche la modale.
 * @param {() => void} props.onClose Appelé sur Échap, clic sur le fond ou bouton de fermeture.
 * @param {string} props.title Titre (nom accessible de la boîte de dialogue).
 * @param {React.ReactNode} props.children Contenu.
 * @param {React.ReactNode} [props.actions] Boutons d'action en pied de modale.
 */
export default function Modal({ open, onClose, title, children, actions }) {
  const dialogRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return undefined
    const previouslyFocused = document.activeElement
    const dialog = dialogRef.current
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const initial = dialog.querySelector(FOCUSABLE) ?? dialog
    initial.focus()

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = [...dialog.querySelectorAll(FOCUSABLE)]
      if (items.length === 0) {
        event.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      previouslyFocused?.focus?.()
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      className="modal__backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="modal__header">
          <h2 id={titleId} className="modal__title">
            {title}
          </h2>
          <button type="button" className="modal__close" aria-label="Fermer" onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {actions && <div className="modal__actions">{actions}</div>}
      </div>
    </div>,
    document.body,
  )
}
