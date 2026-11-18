import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { routes } from '@/app/router'
import { AuthContext } from '@/features/auth/authContext'

const account = (role) => ({ id: '1', username: 'camille', email: 'c@maison.fr', role })

const SESSIONS = {
  loading: { status: 'loading', account: null },
  anonymous: { status: 'anonymous', account: null },
  expired: { status: 'anonymous', account: null, sessionExpired: true },
  user: { status: 'authenticated', account: account('USER'), activeProfileId: 'p1' },
  admin: { status: 'authenticated', account: account('ADMIN'), activeProfileId: 'p1' },
  noProfile: { status: 'authenticated', account: account('USER'), activeProfileId: null },
}

function open(path, session) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const value = { ...SESSIONS[session], login: vi.fn(), logout: vi.fn() }
  render(
    <AuthContext.Provider value={value}>
      <RouterProvider router={router} />
    </AuthContext.Provider>,
  )
  return router
}

describe('routes protégées', () => {
  it('redirige un anonyme vers /login en conservant la destination', () => {
    const router = open('/watch/12?t=30', 'anonymous')
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.search).toBe('?next=%2Fwatch%2F12%3Ft%3D30')
    expect(screen.getByRole('heading', { name: 'Connexion' })).toBeInTheDocument()
  })

  it('une session expirée redirige vers /login avec un message explicatif', () => {
    const router = open('/watch/12', 'expired')
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.state).toEqual({ reason: 'session-expired' })
    expect(screen.getByRole('status')).toHaveTextContent('Votre session a expiré. Reconnectez-vous pour continuer.')
  })

  it('un anonyme ordinaire ne voit pas ce message', () => {
    open('/watch/12', 'anonymous')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('redirige aussi le choix du profil et l’accueil', () => {
    expect(open('/profiles', 'anonymous').state.location.search).toBe('?next=%2Fprofiles')
  })

  it('l’accueil anonyme mène à /login sans paramètre', () => {
    const router = open('/', 'anonymous')
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.search).toBe('')
  })

  it('attend la session avant de décider (pas de redirection prématurée)', async () => {
    const router = open('/admin', 'loading')
    expect(await screen.findByRole('status')).toHaveTextContent('Vérification de votre session…')
    expect(router.state.location.pathname).toBe('/admin')
  })

  it('laisse un utilisateur connecté accéder à l’accueil', () => {
    open('/', 'user')
    expect(screen.getByRole('heading', { name: 'Accueil' })).toBeInTheDocument()
  })

  it('renvoie vers « Qui regarde ? » sans profil actif, en gardant la destination', () => {
    const router = open('/media/m1', 'noProfile')
    expect(router.state.location.pathname).toBe('/profiles')
    expect(router.state.location.search).toBe('?next=%2Fmedia%2Fm1')
  })

  it('l’accueil sans profil mène à /profiles sans paramètre', () => {
    const router = open('/', 'noProfile')
    expect(router.state.location.pathname).toBe('/profiles')
    expect(router.state.location.search).toBe('')
  })

  it('refuse /admin à un USER', async () => {
    const router = open('/admin', 'user')
    expect(await screen.findByRole('heading', { name: 'Accès refusé' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Administration' })).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/admin')
  })

  it('refuse aussi les sous-pages admin à un USER', async () => {
    open('/admin/acquisition', 'user')
    expect(await screen.findByRole('heading', { name: 'Accès refusé' })).toBeInTheDocument()
    expect(screen.queryByText('Administration — Acquisition')).not.toBeInTheDocument()
  })

  it('autorise /admin à un ADMIN', async () => {
    open('/admin', 'admin')
    expect(await screen.findByRole('heading', { name: 'Administration' })).toBeInTheDocument()
  })

  it('affiche la page 404 sans exiger de connexion', () => {
    open('/nimporte-quoi', 'anonymous')
    expect(screen.getByRole('heading', { name: 'Page introuvable' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Retour à l’accueil' })).toHaveAttribute('href', '/')
  })
})
