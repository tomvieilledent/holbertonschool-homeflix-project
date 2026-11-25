import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext } from '@/features/auth/authContext'
import LoginPage from '@/features/auth/LoginPage'
import { ApiError } from '@/services/apiError'
import { expectBusy } from '@/test/busy'

function renderLogin({ login = vi.fn(), status = 'anonymous', url = '/login' } = {}) {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <LoginPage /> },
      { path: '/', element: <p>accueil</p> },
      { path: '/admin', element: <p>administration</p> },
    ],
    { initialEntries: [url] },
  )
  render(
    <AuthContext.Provider value={{ status, login, logout: vi.fn() }}>
      <RouterProvider router={router} />
    </AuthContext.Provider>,
  )
  return { router, login }
}

async function submit(user, username = 'camille', password = 'un-mot-de-passe-long') {
  await user.type(screen.getByLabelText(/Identifiant/), username)
  await user.type(screen.getByLabelText(/Mot de passe/), password)
  await user.click(screen.getByRole('button', { name: 'Se connecter' }))
}

describe('LoginPage', () => {
  it('connecte puis redirige vers la destination demandée', async () => {
    const user = userEvent.setup()
    const { router, login } = renderLogin({
      login: vi.fn().mockResolvedValue(undefined),
      url: '/login?next=%2Fadmin',
    })
    await submit(user)
    expect(login).toHaveBeenCalledWith('camille', 'un-mot-de-passe-long')
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin'))
  })

  it('refuse une destination externe', async () => {
    const user = userEvent.setup()
    const { router } = renderLogin({
      login: vi.fn().mockResolvedValue(undefined),
      url: '/login?next=%2F%2Fevil.example',
    })
    await submit(user)
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('n’appelle pas le serveur si un champ est vide', async () => {
    const user = userEvent.setup()
    const { login } = renderLogin()
    await user.click(screen.getByRole('button', { name: 'Se connecter' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Saisissez votre identifiant')
    expect(login).not.toHaveBeenCalled()
  })

  it('affiche un message générique pour des identifiants incorrects', async () => {
    const user = userEvent.setup()
    renderLogin({ login: vi.fn().mockRejectedValue(new ApiError(401, 'AUTH_INVALID_CREDENTIALS')) })
    await submit(user, 'inconnu')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Identifiant ou mot de passe incorrect.')
    expect(alert).not.toHaveTextContent(/inconnu|existe/i)
    expect(screen.getByLabelText(/Mot de passe/)).toHaveValue('')
  })

  it.each([
    ['compte désactivé', new ApiError(403, 'ACCOUNT_DISABLED'), 'Ce compte est désactivé'],
    ['verrouillage', new ApiError(429, 'RATE_LIMITED', { retryAfter: 30 }), 'Réessayez dans 30 s'],
    ['réseau', new ApiError(0, 'NETWORK_ERROR'), 'Impossible de joindre le serveur'],
  ])('affiche le message adapté : %s', async (_name, error, text) => {
    const user = userEvent.setup()
    renderLogin({ login: vi.fn().mockRejectedValue(error) })
    await submit(user)
    expect(await screen.findByRole('alert')).toHaveTextContent(text)
  })

  it('bloque le formulaire pendant l’envoi sans faire perdre le focus', async () => {
    const user = userEvent.setup()
    let resolve
    renderLogin({
      login: vi.fn(
        () =>
          new Promise((r) => {
            resolve = r
          }),
      ),
    })
    await submit(user)
    expectBusy(screen.getByRole('button', { name: /Se connecter/ }))
    expect(screen.getByLabelText(/Identifiant/)).toHaveAttribute('readonly')
    expect(screen.getByLabelText(/Mot de passe/)).toHaveAttribute('readonly')
    expect(document.body).not.toHaveFocus()
    resolve()
  })

  it('renvoie un utilisateur déjà connecté vers l’accueil', async () => {
    const { router } = renderLogin({ status: 'authenticated' })
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })
})

describe('LoginPage — compte supprimé', () => {
  it('explique que le compte et ses données ont été supprimés', () => {
    const router = createMemoryRouter([{ path: '/login', element: <LoginPage /> }], {
      initialEntries: [{ pathname: '/login', state: { reason: 'account-deleted' } }],
    })
    render(
      <AuthContext.Provider value={{ status: 'anonymous', login: vi.fn(), logout: vi.fn() }}>
        <RouterProvider router={router} />
      </AuthContext.Provider>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Votre compte et ses données ont été supprimés.')
  })
})
