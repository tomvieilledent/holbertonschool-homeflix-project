import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import Modal from '@/components/Modal'

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Ouvrir
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Supprimer le compte"
        actions={<button type="button">Confirmer</button>}
      >
        <p>Action irréversible.</p>
      </Modal>
    </>
  )
}

describe('Modal', () => {
  it('ne rend rien quand elle est fermée', () => {
    render(
      <Modal open={false} onClose={() => {}} title="Titre">
        Contenu
      </Modal>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('expose un dialogue modal nommé par son titre et place le focus dedans', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }))
    const dialog = screen.getByRole('dialog', { name: 'Supprimer le compte' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toContainElement(document.activeElement)
  })

  it('place le focus sur l’élément marqué data-autofocus plutôt que sur le premier focalisable', () => {
    render(
      <Modal open onClose={() => {}} title="Renommer">
        <input aria-label="Nom" data-autofocus />
      </Modal>,
    )
    expect(screen.getByRole('textbox', { name: 'Nom' })).toHaveFocus()
  })

  it('piège le focus avec Tab et Maj+Tab', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }))
    const close = screen.getByRole('button', { name: 'Fermer' })
    const confirm = screen.getByRole('button', { name: 'Confirmer' })

    expect(close).toHaveFocus()
    await user.tab()
    expect(confirm).toHaveFocus()
    await user.tab()
    expect(close).toHaveFocus()
    await user.tab({ shift: true })
    expect(confirm).toHaveFocus()
  })

  it('se ferme avec Échap et rend le focus au déclencheur', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Ouvrir' })
    await user.click(trigger)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('se ferme au clic sur le fond mais pas dans la boîte', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="Titre">
        <p>Contenu</p>
      </Modal>,
    )
    await user.click(screen.getByText('Contenu'))
    expect(onClose).not.toHaveBeenCalled()
    await user.click(screen.getByRole('dialog').parentElement)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
