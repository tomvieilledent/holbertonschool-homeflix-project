import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { forgetProfile, rememberedProfile, rememberProfile } from '@/services/activeProfile'
import { getAccessToken, setAccessToken } from '@/services/api'
import { restoreSession, selectProfile, signIn, signOut } from '@/services/auth'

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())

const ID = '*/api/identity/v1'
const ACCOUNT = { id: 'a1', username: 'camille', email: 'c@maison.fr', role: 'USER' }

beforeEach(() => {
  server.resetHandlers()
  setAccessToken(null)
  forgetProfile()
})
afterEach(() => forgetProfile())

describe('profil actif et session', () => {
  it('choisir un profil le retient pour cet onglet', async () => {
    server.use(http.post(`${ID}/profiles/:profileId/select`, () => HttpResponse.json({ accessToken: 'jeton-p1' })))
    await selectProfile('p1')
    expect(getAccessToken()).toBe('jeton-p1')
    expect(rememberedProfile()).toBe('p1')
  })

  it('un profil refusé par le serveur n’est pas retenu', async () => {
    server.use(
      http.post(`${ID}/profiles/:profileId/select`, () =>
        HttpResponse.json({ code: 'NOT_FOUND', status: 404 }, { status: 404 }),
      ),
    )
    await expect(selectProfile('autre-compte')).rejects.toMatchObject({ status: 404 })
    expect(rememberedProfile()).toBeNull()
  })

  it('se déconnecter oublie le profil, même si le serveur est injoignable', async () => {
    rememberProfile('p1')
    server.use(http.post(`${ID}/auth/logout`, () => HttpResponse.error()))
    await signOut()
    expect(rememberedProfile()).toBeNull()
  })

  it('se connecter oublie le profil d’une session précédente', async () => {
    rememberProfile('profil-d-un-autre-compte')
    server.use(
      http.post(`${ID}/auth/login`, () => HttpResponse.json({ accessToken: 'jeton' })),
      http.get(`${ID}/auth/me`, () => HttpResponse.json({ account: ACCOUNT, activeProfileId: null })),
    )
    await signIn('camille', 'mot-de-passe-12')
    expect(rememberedProfile()).toBeNull()
  })

  it('rouvrir la session après un rechargement rétablit le profil actif', async () => {
    rememberProfile('p1')
    const order = []
    server.use(
      http.post(`${ID}/auth/refresh`, () => {
        order.push('refresh')
        return HttpResponse.json({ accessToken: 'jeton-sans-profil' })
      }),
      http.post(`${ID}/profiles/:profileId/select`, ({ request }) => {
        order.push(`select avec ${request.headers.get('Authorization')}`)
        return HttpResponse.json({ accessToken: 'jeton-p1' })
      }),
      http.get(`${ID}/auth/me`, ({ request }) => {
        order.push(`me avec ${request.headers.get('Authorization')}`)
        const hasProfile = request.headers.get('Authorization') === 'Bearer jeton-p1'
        return HttpResponse.json({ account: ACCOUNT, activeProfileId: hasProfile ? 'p1' : null })
      }),
    )

    await expect(restoreSession()).resolves.toMatchObject({ activeProfileId: 'p1' })
    expect(order).toEqual(['refresh', 'select avec Bearer jeton-sans-profil', 'me avec Bearer jeton-p1'])
  })
})
