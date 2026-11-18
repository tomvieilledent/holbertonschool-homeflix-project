import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SetupPage from '@/features/auth/SetupPage'

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const PASSWORD = 'un-mot-de-passe-long-12'

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/setup', element: <SetupPage /> },
      { path: '/login', element: <p>page de connexion</p> },
    ],
    { initialEntries: ['/setup'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

async function fill(user, { password = PASSWORD, confirmation = PASSWORD } = {}) {
  await user.type(await screen.findByLabelText(/Code d’installation/), 'a3f9c1')
  await user.type(screen.getByLabelText(/Identifiant/), 'admin')
  await user.type(screen.getByLabelText(/Adresse e-mail/), 'admin@maison.fr')
  await user.type(screen.getByLabelText(/^Mot de passe/), password)
  await user.type(screen.getByLabelText(/Confirmer/), confirmation)
}

describe('SetupPage', () => {
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('redirige vers la connexion quand l’installation est déjà faite', async () => {
    fetchMock.mockResolvedValueOnce(json({ setupRequired: false }))
    const router = renderPage()
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })

  it('refuse un mot de passe de moins de 12 caractères sans appeler le serveur', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce(json({ setupRequired: true }))
    renderPage()
    await fill(user, { password: 'trop-court', confirmation: 'trop-court' })
    await user.click(screen.getByRole('button', { name: 'Créer l’administrateur' }))

    expect(await screen.findByText(/au moins 12 caractères/)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('refuse une confirmation différente', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce(json({ setupRequired: true }))
    renderPage()
    await fill(user, { confirmation: `${PASSWORD}x` })
    await user.click(screen.getByRole('button', { name: 'Créer l’administrateur' }))

    expect(await screen.findByText('Les mots de passe ne correspondent pas.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('crée l’administrateur puis redirige vers la connexion', async () => {
    const user = userEvent.setup()
    fetchMock
      .mockResolvedValueOnce(json({ setupRequired: true }))
      .mockResolvedValueOnce(json({ id: '1', username: 'admin', role: 'ADMIN' }, 201))
    const router = renderPage()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Créer l’administrateur' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/identity/v1/setup')
    expect(JSON.parse(init.body)).toEqual({
      setupToken: 'a3f9c1',
      username: 'admin',
      email: 'admin@maison.fr',
      password: PASSWORD,
    })
  })

  it('affiche l’erreur du serveur pour un code d’installation incorrect', async () => {
    const user = userEvent.setup()
    fetchMock
      .mockResolvedValueOnce(json({ setupRequired: true }))
      .mockResolvedValueOnce(json({ code: 'SETUP_TOKEN_INVALID' }, 403))
    renderPage()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Créer l’administrateur' }))

    expect(await screen.findByText('Le code d’installation est incorrect.')).toBeInTheDocument()
  })
})
