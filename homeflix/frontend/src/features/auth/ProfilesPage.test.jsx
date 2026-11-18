import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '@/features/auth/authContext'
import ProfilesPage from '@/features/auth/ProfilesPage'
import RequireProfile from '@/features/auth/RequireProfile'
import { ApiError } from '@/services/apiError'

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const PROFILES = [
  { id: 'p1', name: 'Camille', avatar: 'avatar-1', createdAt: '2026-11-18T10:00:00Z' },
  { id: 'p2', name: 'Léo', avatar: 'avatar-kids', createdAt: '2026-11-18T10:00:00Z' },
]

let loads = 0
function Home() {
  loads += 1 // compte les montages : un changement de profil doit remonter l'écran
  return <p>accueil</p>
}

/** Fournisseur minimal : `selectProfile` met à jour le profil actif comme le vrai. */
function Session({ children, selectProfile }) {
  const [activeProfileId, setActive] = useState(null)
  const value = {
    status: 'authenticated',
    account: { id: 'a', username: 'camille', role: 'USER' },
    activeProfileId,
    login: vi.fn(),
    logout: vi.fn(),
    selectProfile: async (id) => {
      await selectProfile(id)
      setActive(id)
    },
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function renderFlow({ selectProfile = vi.fn().mockResolvedValue(undefined), url = '/profiles' } = {}) {
  const router = createMemoryRouter(
    [
      { path: '/profiles', element: <ProfilesPage /> },
      { element: <RequireProfile />, children: [{ path: '/', element: <Home /> }, { path: '/admin-ish', element: <p>fiche</p> }] },
    ],
    { initialEntries: [url] },
  )
  render(
    <Session selectProfile={selectProfile}>
      <RouterProvider router={router} />
    </Session>,
  )
  return { router, selectProfile }
}

describe('ProfilesPage', () => {
  let fetchMock

  beforeEach(() => {
    loads = 0
    fetchMock = vi.fn(async () => json(PROFILES))
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('liste les profils et redirige vers l’accueil après la sélection', async () => {
    const user = userEvent.setup()
    const { router, selectProfile } = renderFlow()
    await user.click(await screen.findByRole('button', { name: 'Léo' }))
    expect(selectProfile).toHaveBeenCalledWith('p2')
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(fetchMock.mock.calls[0][0]).toBe('/api/identity/v1/profiles')
  })

  it('revient à la destination demandée avant le choix du profil', async () => {
    const user = userEvent.setup()
    const { router } = renderFlow({ url: '/profiles?next=%2Fadmin-ish' })
    await user.click(await screen.findByRole('button', { name: 'Camille' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin-ish'))
  })

  it('affiche l’erreur de sélection et reste sur l’écran', async () => {
    const user = userEvent.setup()
    const { router } = renderFlow({
      selectProfile: vi.fn().mockRejectedValue(new ApiError(404, 'NOT_FOUND')),
    })
    await user.click(await screen.findByRole('button', { name: 'Camille' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('introuvable')
    expect(router.state.location.pathname).toBe('/profiles')
    expect(screen.getByRole('button', { name: 'Camille' })).toBeEnabled()
  })

  it('propose de réessayer quand le chargement échoue', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network'))
    renderFlow()
    expect(await screen.findByRole('button', { name: 'Réessayer' })).toBeInTheDocument()
  })

  it('indique l’absence de profil', async () => {
    fetchMock.mockImplementation(async () => json([]))
    renderFlow()
    expect(await screen.findByRole('heading', { name: 'Aucun profil' })).toBeInTheDocument()
  })

  it('remonte l’écran quand le profil actif change (rechargement des données)', async () => {
    const user = userEvent.setup()
    const { router } = renderFlow()
    await user.click(await screen.findByRole('button', { name: 'Camille' }))
    await waitFor(() => expect(loads).toBe(1))

    await router.navigate('/profiles')
    await user.click(await screen.findByRole('button', { name: 'Léo' }))
    await waitFor(() => expect(loads).toBe(2))
  })
})
