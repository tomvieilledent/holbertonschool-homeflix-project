import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import accountsFixture from '@fixtures/identity/accounts-page.json'
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
  // Les pages d'administration sont chargées à la demande : la première transformation de leur code, sur un exécuteur
  // de CI chargé, dépassait le délai d'attente des requêtes asynchrones. On les charge une fois pour toutes ici.
  beforeAll(async () => {
    await Promise.all(Object.values(import.meta.glob('/src/features/admin/*Page.jsx')).map((load) => load()))
  }, 60_000)

  // L'accueil charge ses données : une réponse vide suffit à ces tests de routage.
  beforeEach(() => {
    const respond = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    const emptyHome = { continueWatching: [], recentlyAdded: [], categories: [], favourites: [] }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => respond(String(url).includes('/admin/accounts') ? accountsFixture : emptyHome)),
    )
  })
  afterEach(() => vi.unstubAllGlobals())

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

  it('laisse un utilisateur avec un profil ouvrir « Ma liste »', () => {
    open('/ma-liste', 'user')
    expect(screen.getByRole('heading', { level: 1, name: 'Ma liste' })).toBeInTheDocument()
  })

  it('« Ma liste » sans profil actif renvoie vers « Qui regarde ? » en gardant la destination', () => {
    const router = open('/ma-liste', 'noProfile')
    expect(router.state.location.pathname).toBe('/profiles')
    expect(router.state.location.search).toBe('?next=%2Fma-liste')
  })

  it('l’accueil sans profil mène à /profiles sans paramètre', () => {
    const router = open('/', 'noProfile')
    expect(router.state.location.pathname).toBe('/profiles')
    expect(router.state.location.search).toBe('')
  })

  describe('administration', () => {
    it('refuse /admin à un USER, sans lui montrer la navigation ni le contenu', async () => {
      const router = open('/admin', 'user')
      expect(await screen.findByRole('heading', { name: 'Accès refusé' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Administration' })).not.toBeInTheDocument()
      expect(screen.queryByRole('navigation', { name: 'Sections de l’administration' })).not.toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/admin')
    })

    it.each(['/admin/comptes', '/admin/bibliotheque', '/admin/acquisition'])('refuse aussi %s à un USER par URL directe', async (path) => {
      open(path, 'user')
      expect(await screen.findByRole('heading', { name: 'Accès refusé' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Comptes' })).not.toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Acquisition' })).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Retour à l’accueil' })).toHaveAttribute('href', '/')
    })

    it('ne montre pas le lien « Administration » à un USER', () => {
      open('/', 'user')
      expect(screen.queryByRole('link', { name: 'Administration' })).not.toBeInTheDocument()
    })

    it('renvoie un anonyme vers la connexion, pas vers « Accès refusé »', async () => {
      const router = open('/admin/comptes', 'anonymous')
      await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
      expect(router.state.location.search).toBe('?next=%2Fadmin%2Fcomptes')
      expect(screen.queryByRole('heading', { name: 'Accès refusé' })).not.toBeInTheDocument()
    })

    it('autorise un ADMIN : /admin ouvre la première section avec la navigation latérale', async () => {
      const router = open('/admin', 'admin')
      expect(await screen.findByRole('heading', { level: 1, name: 'Administration' })).toBeInTheDocument()
      expect(await screen.findByRole('heading', { level: 2, name: 'Comptes' })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/admin/comptes')
      const nav = screen.getByRole('navigation', { name: 'Sections de l’administration' })
      expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(['Comptes', 'Bibliothèque', 'Acquisition'])
      expect(within(nav).getByRole('link', { name: 'Comptes' })).toHaveAttribute('aria-current', 'page')
    })

    it('passe d’une section à l’autre avec la navigation latérale', async () => {
      const user = userEvent.setup()
      const router = open('/admin/comptes', 'admin')
      await screen.findByRole('heading', { level: 2, name: 'Comptes' })
      await user.click(within(screen.getByRole('navigation', { name: 'Sections de l’administration' })).getByRole('link', { name: 'Acquisition' }))

      expect(await screen.findByRole('heading', { level: 2, name: 'Acquisition' })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/admin/acquisition')
      expect(screen.getByRole('link', { name: 'Acquisition' })).toHaveAttribute('aria-current', 'page')
      expect(screen.getByRole('link', { name: 'Comptes' })).not.toHaveAttribute('aria-current')
    })

    it('affiche la page introuvable pour une section inconnue', async () => {
      open('/admin/inconnue', 'admin')
      expect(await screen.findByRole('heading', { name: 'Page introuvable' })).toBeInTheDocument()
    })
  })

  it('affiche la page 404 sans exiger de connexion', () => {
    open('/nimporte-quoi', 'anonymous')
    expect(screen.getByRole('heading', { name: 'Page introuvable' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Retour à l’accueil' })).toHaveAttribute('href', '/')
  })
})
