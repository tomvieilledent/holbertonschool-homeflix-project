import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthProvider from '@/features/auth/AuthProvider'
import { useAuth } from '@/features/auth/authContext'
import { apiFetch, getAccessToken } from '@/services/api'

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const ME = {
  account: { id: '1', username: 'camille', email: 'c@maison.fr', role: 'ADMIN', enabled: true },
  activeProfileId: 'p1',
}

function Probe() {
  const { status, account, activeProfileId, sessionExpired, accountDeleted, login, logout, deleteAccount, selectProfile } = useAuth()
  return (
    <>
      <p data-testid="status">{status}</p>
      <p data-testid="expired">{String(sessionExpired)}</p>
      <p data-testid="deleted">{String(accountDeleted)}</p>
      <p data-testid="user">{account?.username ?? '-'}</p>
      <button type="button" onClick={() => login('camille', 'un-mot-de-passe-long')}>
        login
      </button>
      <p data-testid="profile">{activeProfileId ?? '-'}</p>
      <button type="button" onClick={logout}>
        logout
      </button>
      <button type="button" onClick={() => deleteAccount('un-mot-de-passe-long').catch(() => {})}>
        delete
      </button>
      <button type="button" onClick={() => selectProfile('p2')}>
        select
      </button>
    </>
  )
}

const urlsCalled = (fetchMock) => fetchMock.mock.calls.map(([url]) => url)

describe('AuthProvider', () => {
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('rouvre la session via le cookie de rafraîchissement', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ accessToken: 'jeton', expiresIn: 900, tokenType: 'Bearer' }))
      .mockResolvedValueOnce(json(ME))
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    expect(screen.getByTestId('status')).toHaveTextContent('loading')
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    expect(screen.getByTestId('user')).toHaveTextContent('camille')

    const [refreshUrl, refreshInit] = fetchMock.mock.calls[0]
    expect(refreshUrl).toBe('/api/identity/v1/auth/refresh')
    expect(refreshInit.headers['X-Requested-With']).toBe('homeflix')
    const [meUrl, meInit] = fetchMock.mock.calls[1]
    expect(meUrl).toBe('/api/identity/v1/auth/me')
    expect(meInit.headers.Authorization).toBe('Bearer jeton')
  })

  it('reste anonyme quand il n’y a pas de session', async () => {
    fetchMock.mockResolvedValueOnce(json({ code: 'SESSION_EXPIRED' }, 401))
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
    expect(screen.getByTestId('user')).toHaveTextContent('-')
  })

  it('ne rafraîchit qu’une fois sous StrictMode (jeton à usage unique)', async () => {
    fetchMock.mockResolvedValueOnce(json({ code: 'SESSION_EXPIRED' }, 401))
    render(
      <StrictMode>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </StrictMode>,
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
    expect(urlsCalled(fetchMock).filter((u) => u.endsWith('/auth/refresh'))).toHaveLength(1)
  })

  it('redevient anonyme avec sessionExpired quand le client d’API perd la session', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ accessToken: 'jeton', expiresIn: 900, tokenType: 'Bearer' }))
      .mockResolvedValueOnce(json(ME))
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    expect(screen.getByTestId('expired')).toHaveTextContent('false')

    // Un appel protégé reçoit 401, le refresh est refusé : la session est perdue.
    fetchMock
      .mockResolvedValueOnce(json({ code: 'SESSION_EXPIRED' }, 401))
      .mockResolvedValueOnce(json({ code: 'SESSION_EXPIRED' }, 401))
    await expect(apiFetch('library', '/v1/media')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' })

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
    expect(screen.getByTestId('expired')).toHaveTextContent('true')
  })

  it('supprime le compte avec le mot de passe, puis redevient anonyme sans appeler la déconnexion', async () => {
    const user = userEvent.setup()
    fetchMock
      .mockResolvedValueOnce(json({ code: 'SESSION_EXPIRED' }, 401))
      .mockResolvedValueOnce(json({ accessToken: 'jeton2', expiresIn: 900, tokenType: 'Bearer' }))
      .mockResolvedValueOnce(json(ME))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
    await user.click(screen.getByRole('button', { name: 'login' }))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))

    await user.click(screen.getByRole('button', { name: 'delete' }))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
    expect(fetchMock.mock.calls[3][0]).toBe('/api/identity/v1/accounts/me')
    expect(fetchMock.mock.calls[3][1].method).toBe('DELETE')
    expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toEqual({ password: 'un-mot-de-passe-long' })
    expect(getAccessToken()).toBeNull()
    expect(screen.getByTestId('deleted')).toHaveTextContent('true')
    expect(fetchMock).toHaveBeenCalledTimes(4) // pas de /auth/logout : le compte et ses sessions n'existent plus
  })

  it('garde la session ouverte quand la suppression est refusée (mot de passe incorrect)', async () => {
    const user = userEvent.setup()
    fetchMock
      .mockResolvedValueOnce(json({ code: 'SESSION_EXPIRED' }, 401))
      .mockResolvedValueOnce(json({ accessToken: 'jeton2', expiresIn: 900, tokenType: 'Bearer' }))
      .mockResolvedValueOnce(json(ME))
      .mockResolvedValueOnce(json({ code: 'AUTH_INVALID_CREDENTIALS', status: 401 }, 401))
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
    await user.click(screen.getByRole('button', { name: 'login' }))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))

    await user.click(screen.getByRole('button', { name: 'delete' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
    expect(getAccessToken()).toBe('jeton2')
  })

  it('connecte puis déconnecte', async () => {
    const user = userEvent.setup()
    fetchMock
      .mockResolvedValueOnce(json({ code: 'SESSION_EXPIRED' }, 401))
      .mockResolvedValueOnce(json({ accessToken: 'jeton2', expiresIn: 900, tokenType: 'Bearer' }))
      .mockResolvedValueOnce(json(ME))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))

    await user.click(screen.getByRole('button', { name: 'login' }))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    const loginInit = fetchMock.mock.calls[1][1]
    expect(JSON.parse(loginInit.body)).toEqual({
      username: 'camille',
      password: 'un-mot-de-passe-long',
    })

    await user.click(screen.getByRole('button', { name: 'logout' }))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
    expect(fetchMock.mock.calls[3][0]).toBe('/api/identity/v1/auth/logout')
    expect(fetchMock.mock.calls[3][1].headers['X-Requested-With']).toBe('homeflix')
  })

  it('propage le profil actif puis vide l’état à la déconnexion', async () => {
    const user = userEvent.setup()
    fetchMock
      .mockResolvedValueOnce(json({ accessToken: 'jeton', expiresIn: 900, tokenType: 'Bearer' }))
      .mockResolvedValueOnce(json(ME))
      .mockResolvedValueOnce(json({ accessToken: 'jeton-pid', expiresIn: 900, tokenType: 'Bearer' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('profile')).toHaveTextContent('p1'))

    await user.click(screen.getByRole('button', { name: 'select' }))
    await waitFor(() => expect(screen.getByTestId('profile')).toHaveTextContent('p2'))
    expect(fetchMock.mock.calls[2][0]).toBe('/api/identity/v1/profiles/p2/select')
    expect(getAccessToken()).toBe('jeton-pid')

    await user.click(screen.getByRole('button', { name: 'logout' }))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
    expect(screen.getByTestId('profile')).toHaveTextContent('-')
    expect(getAccessToken()).toBeNull()
  })
})
