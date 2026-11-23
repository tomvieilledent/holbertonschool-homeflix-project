import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { routes } from '@/app/router'
import { AuthContext } from '@/features/auth/authContext'

function open(role = 'USER') {
  const logout = vi.fn()
  const router = createMemoryRouter(routes, { initialEntries: ['/'] })
  const account = { id: '1', username: 'camille', email: 'c@maison.fr', role }

  // Comme le vrai fournisseur : après la déconnexion, la session passe à « anonymous ».
  function Session({ children }) {
    const [status, setStatus] = useState('authenticated')
    const value = {
      status,
      activeProfileId: 'p1', // sans profil actif, RequireProfile renverrait vers /profiles
      account: status === 'authenticated' ? account : null,
      login: vi.fn(),
      logout: async () => {
        logout()
        setStatus('anonymous')
      },
    }
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  }

  render(
    <Session>
      <RouterProvider router={router} />
    </Session>,
  )
  return { router, logout }
}

describe('AppLayout', () => {
  it('le lien d’évitement est le premier élément focalisable et mène au contenu', async () => {
    const user = userEvent.setup()
    open()
    await user.tab()
    const skip = screen.getByRole('link', { name: 'Aller au contenu principal' })
    expect(skip).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('main')).toHaveFocus()
  })

  it('expose un seul repère principal et une navigation nommée', () => {
    open()
    expect(screen.getAllByRole('main')).toHaveLength(1)
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' })
    expect(nav).toHaveTextContent('Accueil')
  })

  it('marque la page courante dans la navigation', () => {
    open()
    expect(screen.getByRole('link', { name: 'Accueil' })).toHaveAttribute('aria-current', 'page')
  })

  it('n’affiche « Administration » qu’aux administrateurs', () => {
    open('USER')
    expect(screen.queryByRole('link', { name: 'Administration' })).not.toBeInTheDocument()
  })

  it('affiche « Administration » à un ADMIN', () => {
    open('ADMIN')
    expect(screen.getByRole('link', { name: 'Administration' })).toBeInTheDocument()
  })
})

describe('ProfileMenu', () => {
  it('s’ouvre et se ferme au clavier, et rend le focus au bouton', async () => {
    const user = userEvent.setup()
    open()
    const toggle = screen.getByRole('button', { name: /camille/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'Changer de profil' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Gérer les profils' })).toHaveAttribute('href', '/profiles/manage')

    await user.keyboard('{Escape}')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveFocus()
  })

  it('se ferme au clic à l’extérieur', async () => {
    const user = userEvent.setup()
    open()
    await user.click(screen.getByRole('button', { name: /camille/ }))
    await user.click(screen.getByRole('main'))
    expect(screen.queryByRole('link', { name: 'Changer de profil' })).not.toBeInTheDocument()
  })

  it('« Se déconnecter » déconnecte et mène à /login sans destination', async () => {
    const user = userEvent.setup()
    const { router, logout } = open()
    await user.click(screen.getByRole('button', { name: /camille/ }))
    await user.click(screen.getByRole('button', { name: 'Se déconnecter' }))
    expect(logout).toHaveBeenCalledTimes(1)
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.search).toBe('')
  })
})
