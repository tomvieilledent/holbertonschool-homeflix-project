import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import AccountPage from '@/features/auth/AccountPage'
import { AuthContext } from '@/features/auth/authContext'
import { ApiError } from '@/services/api'

const account = { id: '1', username: 'camille', email: 'c@maison.fr', role: 'USER' }

function open(deleteAccount) {
  const router = createMemoryRouter(
    [
      { path: '/compte', element: <AccountPage /> },
    ],
    { initialEntries: ['/compte'] },
  )
  render(
    <AuthContext.Provider value={{ status: 'authenticated', account, deleteAccount }}>
      <RouterProvider router={router} />
    </AuthContext.Provider>,
  )
  return router
}

const openDialog = async (user) => {
  await user.click(screen.getByRole('button', { name: 'Supprimer mon compte' }))
  return screen.findByRole('dialog')
}
const confirmButton = () => screen.getByRole('button', { name: 'Supprimer définitivement' })

describe('AccountPage', () => {
  it('affiche le compte et dit clairement ce qui sera supprimé et ce qui ne le sera pas', () => {
    open(vi.fn())
    expect(screen.getByRole('heading', { level: 1, name: 'Mon compte' })).toBeInTheDocument()
    expect(screen.getByText('camille')).toBeInTheDocument()
    expect(screen.getByText('c@maison.fr')).toBeInTheDocument()
    const danger = screen.getByRole('region', { name: 'Supprimer mon compte' })
    expect(danger).toHaveTextContent('vos profils')
    expect(danger).toHaveTextContent('favoris et la progression')
    expect(danger).toHaveTextContent('Les fichiers médias de la bibliothèque ne sont jamais supprimés')
  })

  it('exige le mot de passe : sans lui, rien ne peut être confirmé', async () => {
    const deleteAccount = vi.fn()
    const user = userEvent.setup()
    open(deleteAccount)
    const dialog = await openDialog(user)
    expect(dialog).toHaveTextContent('Cette action est irréversible')
    expect(confirmButton()).toBeDisabled()
    await user.click(confirmButton())
    await user.type(screen.getByLabelText(/Mot de passe/), '{Enter}')
    expect(deleteAccount).not.toHaveBeenCalled()
  })

  it('annuler ferme la modale sans rien supprimer', async () => {
    const deleteAccount = vi.fn()
    const user = userEvent.setup()
    open(deleteAccount)
    await openDialog(user)
    await user.type(screen.getByLabelText(/Mot de passe/), 'secret')
    await user.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(deleteAccount).not.toHaveBeenCalled()
  })

  it('supprime le compte avec le mot de passe saisi', async () => {
    const deleteAccount = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    open(deleteAccount)
    await openDialog(user)
    await user.type(screen.getByLabelText(/Mot de passe/), 'un-mot-de-passe-long')
    await user.click(confirmButton())
    await waitFor(() => expect(deleteAccount).toHaveBeenCalledExactlyOnceWith('un-mot-de-passe-long'))
  })

  it('Entrée dans le champ valide aussi', async () => {
    const deleteAccount = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    open(deleteAccount)
    await openDialog(user)
    await user.type(screen.getByLabelText(/Mot de passe/), 'un-mot-de-passe-long{Enter}')
    await waitFor(() => expect(deleteAccount).toHaveBeenCalledWith('un-mot-de-passe-long'))
  })

  it('un mot de passe incorrect affiche l’erreur, laisse la modale ouverte et ne quitte pas la page', async () => {
    const deleteAccount = vi.fn().mockRejectedValue(new ApiError(401, 'AUTH_INVALID_CREDENTIALS'))
    const user = userEvent.setup()
    const router = open(deleteAccount)
    await openDialog(user)
    await user.type(screen.getByLabelText(/Mot de passe/), 'mauvais')
    await user.click(confirmButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('Mot de passe incorrect.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/compte')
    expect(confirmButton()).toBeEnabled() // on peut corriger et réessayer
  })

  it('le dernier administrateur ne peut pas supprimer son compte : message du serveur, session intacte', async () => {
    const deleteAccount = vi.fn().mockRejectedValue(new ApiError(409, 'LAST_ADMIN'))
    const user = userEvent.setup()
    const router = open(deleteAccount)
    await openDialog(user)
    await user.type(screen.getByLabelText(/Mot de passe/), 'un-mot-de-passe-long')
    await user.click(confirmButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('Il doit toujours rester au moins un administrateur.')
    expect(router.state.location.pathname).toBe('/compte')
  })
})
