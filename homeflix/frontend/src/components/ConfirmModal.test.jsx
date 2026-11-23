import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ConfirmModal from '@/components/ConfirmModal'
import { ApiError } from '@/services/apiError'

const renderModal = (props = {}) =>
  render(
    <ConfirmModal title="Supprimer ?" confirmLabel="Supprimer" onConfirm={vi.fn().mockResolvedValue()} onClose={vi.fn()} {...props}>
      <p>Cette action est irréversible.</p>
    </ConfirmModal>,
  )

describe('ConfirmModal', () => {
  it('expose une boîte de dialogue nommée avec l’explication, et le focus sur « Annuler »', () => {
    renderModal()
    expect(screen.getByRole('dialog', { name: 'Supprimer ?' })).toBeInTheDocument()
    expect(screen.getByText('Cette action est irréversible.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Annuler' })).toHaveFocus()
  })

  it('ne confirme rien sans clic sur le bouton de confirmation', async () => {
    const onConfirm = vi.fn().mockResolvedValue()
    renderModal({ onConfirm })
    await userEvent.keyboard('{Enter}') // Entrée sur « Annuler » ferme, ne confirme pas
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('« Annuler » et Échap ferment sans confirmer', async () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()
    renderModal({ onClose, onConfirm })
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('appelle onConfirm au clic sur le bouton de confirmation', async () => {
    const onConfirm = vi.fn().mockResolvedValue()
    renderModal({ onConfirm })
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('affiche le message de l’erreur et reste ouverte', async () => {
    const onClose = vi.fn()
    renderModal({ onConfirm: vi.fn().mockRejectedValue(new ApiError(409, 'LAST_ADMIN')), onClose })
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Il doit toujours rester au moins un administrateur.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeEnabled() // on peut réessayer ou annuler
  })

  it('bloque un double clic pendant l’appel', async () => {
    let release
    const onConfirm = vi.fn(() => new Promise((resolve) => {
      release = resolve
    }))
    renderModal({ onConfirm })
    const confirm = screen.getByRole('button', { name: 'Supprimer' })
    await userEvent.click(confirm)
    await userEvent.click(confirm)
    expect(onConfirm).toHaveBeenCalledTimes(1)
    release()
  })
})
