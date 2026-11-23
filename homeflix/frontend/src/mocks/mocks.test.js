import mediaPage from '@fixtures/library/media-page.json'
import profilesFixture from '@fixtures/identity/profiles.json'
import { setupServer } from 'msw/node'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { MOCK_PASSWORD } from '@/mocks/db'
import { createMocks } from '@/mocks/handlers'

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())
beforeEach(() => {
  sessionStorage.clear()
  server.resetHandlers(...createMocks().handlers)
})

async function call(path, { method = 'GET', body, token = true, headers = {} } = {}) {
  const response = await fetch(new URL(path, window.location.origin), {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer mock-access-token' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}

const IDENTITY = '/api/identity/v1'
const LIBRARY = '/api/library/v1'
const ACQUISITION = '/api/acquisition/v1'

async function login(username = 'admin', { profile = true } = {}) {
  const result = await call(`${IDENTITY}/auth/login`, {
    method: 'POST',
    token: false,
    body: { username, password: MOCK_PASSWORD },
  })
  expect(result.status).toBe(200)
  if (profile) {
    await call(`${IDENTITY}/profiles/${profilesFixture[0].id}/select`, { method: 'POST' })
  }
}

describe('auth', () => {
  it('refuse un mauvais mot de passe et un compte désactivé', async () => {
    const bad = await call(`${IDENTITY}/auth/login`, {
      method: 'POST',
      token: false,
      body: { username: 'admin', password: 'faux' },
    })
    expect(bad.status).toBe(401)
    expect(bad.body.code).toBe('AUTH_INVALID_CREDENTIALS')

    const disabled = await call(`${IDENTITY}/auth/login`, {
      method: 'POST',
      token: false,
      body: { username: 'invite', password: MOCK_PASSWORD },
    })
    expect(disabled.status).toBe(403)
    expect(disabled.body.code).toBe('ACCOUNT_DISABLED')
  })

  it('exige une session pour /auth/me, puis renvoie le compte', async () => {
    expect((await call(`${IDENTITY}/auth/me`)).status).toBe(401)
    await login('admin', { profile: false })
    const me = await call(`${IDENTITY}/auth/me`)
    expect(me.body.account.username).toBe('admin')
    expect(me.body.account.role).toBe('ADMIN')
    expect(me.body.activeProfileId).toBeNull()
  })

  it('le rafraîchissement exige l’en-tête X-Requested-With et une session', async () => {
    const noSession = await call(`${IDENTITY}/auth/refresh`, {
      method: 'POST',
      token: false,
      headers: { 'X-Requested-With': 'homeflix' },
    })
    expect(noSession.body.code).toBe('SESSION_EXPIRED')

    await login('admin', { profile: false })
    expect((await call(`${IDENTITY}/auth/refresh`, { method: 'POST', token: false })).status).toBe(403)
    const ok = await call(`${IDENTITY}/auth/refresh`, {
      method: 'POST',
      token: false,
      headers: { 'X-Requested-With': 'homeflix' },
    })
    expect(ok.status).toBe(200)
    expect(ok.body.accessToken).toBeTruthy()
  })

  it('la session survit au rechargement (sessionStorage) et se ferme à la déconnexion', async () => {
    await login('famille', { profile: false })
    expect(sessionStorage.getItem('homeflix:mock-session')).toContain('accountId')
    await call(`${IDENTITY}/auth/logout`, { method: 'POST', token: false })
    expect(sessionStorage.getItem('homeflix:mock-session')).toBeNull()
    expect((await call(`${IDENTITY}/auth/me`)).status).toBe(401)
  })
})

describe('profils', () => {
  it('liste les profils des fixtures', async () => {
    await login('famille', { profile: false })
    expect((await call(`${IDENTITY}/profiles`)).body).toEqual(profilesFixture)
  })

  it('sélectionne un profil, en crée un, le supprime, et plafonne à 5', async () => {
    await login('famille', { profile: false })
    await call(`${IDENTITY}/profiles/${profilesFixture[1].id}/select`, { method: 'POST' })
    expect((await call(`${IDENTITY}/auth/me`)).body.activeProfileId).toBe(profilesFixture[1].id)

    const created = await call(`${IDENTITY}/profiles`, { method: 'POST', body: { name: 'Zoé' } })
    expect(created.status).toBe(201)
    expect((await call(`${IDENTITY}/profiles`, { method: 'POST', body: { name: ' ' } })).status).toBe(400)
    await call(`${IDENTITY}/profiles`, { method: 'POST', body: { name: 'Quatre' } })
    const limit = await call(`${IDENTITY}/profiles`, { method: 'POST', body: { name: 'Cinq' } })
    expect(limit.body.code).toBe('PROFILE_LIMIT_REACHED')

    expect((await call(`${IDENTITY}/profiles/${created.body.id}`, { method: 'DELETE' })).status).toBe(204)
  })

  it('refuse un nom déjà utilisé ou trop long, à la création comme au renommage', async () => {
    await login('famille', { profile: false })
    const [first, second] = profilesFixture
    const duplicate = await call(`${IDENTITY}/profiles`, { method: 'POST', body: { name: ` ${first.name.toUpperCase()} ` } })
    expect(duplicate.status).toBe(409)
    expect(duplicate.body.code).toBe('CONFLICT')
    expect((await call(`${IDENTITY}/profiles`, { method: 'POST', body: { name: 'x'.repeat(31) } })).status).toBe(400)

    const rename = (id, name) => call(`${IDENTITY}/profiles/${id}`, { method: 'PATCH', body: { name } })
    expect((await rename(second.id, first.name)).body.code).toBe('CONFLICT')
    expect((await rename(second.id, second.name)).status).toBe(200) // son propre nom n'est pas un doublon
    expect((await rename(second.id, 'y'.repeat(31))).status).toBe(400)
  })

  it('conserve le dernier profil du compte', async () => {
    await login('famille', { profile: false })
    for (const profile of profilesFixture.slice(1)) {
      expect((await call(`${IDENTITY}/profiles/${profile.id}`, { method: 'DELETE' })).status).toBe(204)
    }
    const last = await call(`${IDENTITY}/profiles/${profilesFixture[0].id}`, { method: 'DELETE' })
    expect(last.status).toBe(409)
    expect(last.body.code).toBe('CONFLICT')
  })
})

describe('catalogue', () => {
  it('exige un profil actif pour l’accueil', async () => {
    await login('famille', { profile: false })
    expect((await call(`${LIBRARY}/home`)).body.code).toBe('PROFILE_NOT_SELECTED')
  })

  it('renvoie l’accueil du profil de démonstration', async () => {
    await login('famille')
    const home = (await call(`${LIBRARY}/home`)).body
    expect(home.continueWatching).toHaveLength(2)
    expect(home.favourites).toHaveLength(3)
    expect(home.recentlyAdded).toHaveLength(6)
    expect(home.categories.length).toBeGreaterThan(0)
  })

  it('un profil sans historique obtient des listes vides', async () => {
    await login('famille', { profile: false })
    await call(`${IDENTITY}/profiles/${profilesFixture[1].id}/select`, { method: 'POST' })
    const home = (await call(`${LIBRARY}/home`)).body
    expect(home.continueWatching).toEqual([])
    expect(home.favourites).toEqual([])
  })

  it('la liste respecte la forme des fixtures et les filtres', async () => {
    await login('famille')
    const all = (await call(`${LIBRARY}/media`)).body
    expect(all.total).toBe(mediaPage.total)
    expect(Object.keys(all.items[0]).sort()).toEqual(Object.keys(mediaPage.items[0]).sort())

    const search = (await call(`${LIBRARY}/media?q=sintel`)).body
    expect(search.items.map((m) => m.title)).toEqual(['Sintel'])
    expect((await call(`${LIBRARY}/media?q=zzz`)).body).toMatchObject({ items: [], total: 0, totalPages: 0 })

    const unavailable = (await call(`${LIBRARY}/media?availability=UNAVAILABLE`)).body
    expect(unavailable.items.every((m) => m.availability === 'UNAVAILABLE')).toBe(true)

    const sorted = (await call(`${LIBRARY}/media?sort=title,asc&size=3`)).body
    expect(sorted.items).toHaveLength(3)
    expect(sorted.totalPages).toBe(4)
  })

  it('renvoie le détail d’un média, ou une erreur 404', async () => {
    await login('famille')
    const { id } = mediaPage.items[0]
    expect((await call(`${LIBRARY}/media/${id}`)).body).toEqual(mediaPage.items[0])
    expect((await call(`${LIBRARY}/media/inconnu`)).body.code).toBe('NOT_FOUND')
  })
})

describe('favoris, progression et lecture', () => {
  it('ajoute et retire un favori, visible dans l’accueil', async () => {
    await login('famille')
    const target = mediaPage.items.find((m) => m.title === 'Spring').id
    expect((await call(`${LIBRARY}/me/favourites/${target}`, { method: 'PUT' })).status).toBe(204)
    expect((await call(`${LIBRARY}/me/favourites`)).body.items.some((m) => m.id === target)).toBe(true)
    await call(`${LIBRARY}/me/favourites/${target}`, { method: 'DELETE' })
    expect((await call(`${LIBRARY}/me/favourites`)).body.items.some((m) => m.id === target)).toBe(false)
  })

  it('enregistre la progression et calcule l’état', async () => {
    await login('famille')
    const { id, durationSeconds } = mediaPage.items[3]
    const url = `${LIBRARY}/media/${id}/progress`
    expect((await call(url)).body.state).toBe('NOT_STARTED')

    const started = await call(url, { method: 'PUT', body: { positionSeconds: 60, durationSeconds } })
    expect(started.body.state).toBe('STARTED')
    const done = await call(url, {
      method: 'PUT',
      body: { positionSeconds: durationSeconds, durationSeconds },
    })
    expect(done.body.state).toBe('COMPLETED')
    expect((await call(url, { method: 'PUT', body: { positionSeconds: -1, durationSeconds } })).status).toBe(400)

    await call(url, { method: 'DELETE' })
    expect((await call(url)).body.state).toBe('NOT_STARTED')
  })

  it('délivre un ticket pour un média disponible, refuse un indisponible', async () => {
    await login('famille')
    const available = mediaPage.items.find((m) => m.availability === 'AVAILABLE')
    const unavailable = mediaPage.items.find((m) => m.availability === 'UNAVAILABLE')
    const ticket = await call(`${LIBRARY}/media/${available.id}/stream-ticket`, { method: 'POST' })
    expect(ticket.body.url).toContain(available.id)
    expect((await call(`${LIBRARY}/media/${unavailable.id}/stream-ticket`, { method: 'POST' })).body.code).toBe(
      'MEDIA_UNAVAILABLE',
    )
  })
})

describe('administration', () => {
  it('refuse les routes admin à un USER', async () => {
    await login('famille')
    expect((await call(`${LIBRARY}/admin/media-roots`)).status).toBe(403)
    expect((await call(`${IDENTITY}/admin/accounts`)).body.code).toBe('ACCESS_DENIED')
    expect((await call(`${ACQUISITION}/catalogue`)).status).toBe(403)
  })

  it('gère les comptes et protège le dernier administrateur', async () => {
    await login('admin')
    const accounts = (await call(`${IDENTITY}/admin/accounts`)).body
    expect(accounts.total).toBe(3)
    const admin = accounts.items.find((a) => a.role === 'ADMIN')
    expect((await call(`${IDENTITY}/admin/accounts/${admin.id}`, { method: 'PATCH', body: { enabled: false } })).body.code).toBe(
      'LAST_ADMIN',
    )
    expect((await call(`${IDENTITY}/admin/accounts/${admin.id}`, { method: 'DELETE' })).body.code).toBe('LAST_ADMIN')

    const created = await call(`${IDENTITY}/admin/accounts`, {
      method: 'POST',
      body: { username: 'nouveau', email: 'n@maison.fr', password: 'un-mot-de-passe-long', role: 'USER' },
    })
    expect(created.status).toBe(201)
    expect((await call(`${IDENTITY}/admin/accounts/${created.body.id}`, { method: 'DELETE' })).status).toBe(204)
  })

  it('refuse un identifiant ou un e-mail déjà utilisé à la création d’un compte', async () => {
    await login('admin')
    const create = (username, email) =>
      call(`${IDENTITY}/admin/accounts`, {
        method: 'POST',
        body: { username, email, password: 'un-mot-de-passe-long', role: 'USER' },
      })
    const sameUsername = await create('FAMILLE', 'autre@maison.fr')
    expect(sameUsername.status).toBe(409)
    expect(sameUsername.body.code).toBe('CONFLICT')
    expect((await create('autre-nom', 'Famille@Homeflix.local')).body.code).toBe('CONFLICT')
    const ok = await create('autre-nom', 'autre@maison.fr')
    expect(ok.status).toBe(201)
    expect(ok.body.mustChangePassword).toBe(false) // comme le vrai service

    const reset = await call(`${IDENTITY}/admin/accounts/${ok.body.id}/password-reset`, {
      method: 'POST',
      body: { temporaryPassword: 'temporaire-12345' },
    })
    expect(reset.status).toBe(204)
    expect((await call(`${IDENTITY}/admin/accounts/${ok.body.id}`)).body.mustChangePassword).toBe(true)
  })

  it('valide un dossier dans l’ordre du contrat : autorisé, existant, dossier, lisible, sans chevauchement', async () => {
    await login('admin')
    const check = async (path) => (await call(`${LIBRARY}/admin/media-roots/validate`, { method: 'POST', body: { path } })).body
    expect(await check('/media/series')).toEqual({ valid: true })
    expect((await check('/etc/passwd')).code).toBe('ROOT_NOT_ALLOWED') // l'emplacement prime sur le reste
    expect((await check('/media/introuvable')).code).toBe('ROOT_NOT_FOUND')
    expect((await check('/media/film.mp4')).code).toBe('ROOT_NOT_A_DIRECTORY')
    expect((await check('/media/illisible')).code).toBe('ROOT_NOT_READABLE')
    expect((await check('/media/films/saison1')).code).toBe('ROOT_OVERLAP') // sous « /media/films », déjà configuré

    const refused = await call(`${LIBRARY}/admin/media-roots`, { method: 'POST', body: { path: '/media/illisible' } })
    expect(refused.status).toBe(400)
    expect(refused.body.code).toBe('ROOT_NOT_READABLE')
  })

  it('corrige les métadonnées dans les limites du contrat, et la correction est visible dans le catalogue', async () => {
    await login('admin')
    const [first] = (await call(`${LIBRARY}/media`)).body.items
    const patch = (body) => call(`${LIBRARY}/admin/media/${first.id}`, { method: 'PATCH', body })

    const updated = await patch({ title: '  Titre corrigé ', genres: ['Drame'], year: 1999 })
    expect(updated.status).toBe(200)
    expect(updated.body).toMatchObject({ title: 'Titre corrigé', genres: ['Drame'], year: 1999 })
    expect((await call(`${LIBRARY}/media/${first.id}`)).body.title).toBe('Titre corrigé')
    expect((await call(`${LIBRARY}/media?q=corrigé`)).body.items.map((m) => m.id)).toEqual([first.id])

    for (const bad of [
      {},
      { title: ' ' },
      { title: 'x'.repeat(201) },
      { description: 'x'.repeat(2001) },
      { genres: Array.from({ length: 11 }, (_, i) => `g${i}`) },
      { genres: ['x'.repeat(41)] },
      { year: 1887 },
      { year: 2101 },
      { year: 2008.5 },
    ]) {
      const refused = await patch(bad)
      expect({ bad: JSON.stringify(bad).slice(0, 40), status: refused.status, code: refused.body.code }).toEqual({
        bad: JSON.stringify(bad).slice(0, 40),
        status: 400,
        code: 'VALIDATION_ERROR',
      })
    }
    expect((await call(`${LIBRARY}/media/${first.id}`)).body.title).toBe('Titre corrigé') // rien n'a changé
  })

  it('retire une entrée du catalogue', async () => {
    await login('admin')
    const [first] = (await call(`${LIBRARY}/media`)).body.items
    expect((await call(`${LIBRARY}/admin/media/${first.id}`, { method: 'DELETE' })).status).toBe(204)
    expect((await call(`${LIBRARY}/media/${first.id}`)).status).toBe(404)
    expect((await call(`${LIBRARY}/admin/media/${first.id}`, { method: 'DELETE' })).body.code).toBe('NOT_FOUND')
  })

  it('valide, ajoute et retire un dossier autorisé', async () => {
    await login('admin')
    const [existing] = (await call(`${LIBRARY}/admin/media-roots`)).body

    const outside = await call(`${LIBRARY}/admin/media-roots/validate`, { method: 'POST', body: { path: '/etc' } })
    expect(outside.status).toBe(200)
    expect(outside.body).toMatchObject({ valid: false, code: 'ROOT_NOT_ALLOWED' })
    expect((await call(`${LIBRARY}/admin/media-roots`, { method: 'POST', body: { path: '/etc' } })).status).toBe(400)

    const overlap = await call(`${LIBRARY}/admin/media-roots`, {
      method: 'POST',
      body: { path: `${existing.path}/sous-dossier` },
    })
    expect(overlap.status).toBe(409)
    expect(overlap.body.code).toBe('ROOT_OVERLAP')

    const created = await call(`${LIBRARY}/admin/media-roots`, { method: 'POST', body: { path: '/downloads/series' } })
    expect(created.status).toBe(201)
    expect(created.body.label).toBe('series')
    expect((await call(`${LIBRARY}/admin/media-roots/${created.body.id}`, { method: 'DELETE' })).status).toBe(204)
  })

  it('simule la progression de l’indexation', async () => {
    await login('admin')
    expect((await call(`${LIBRARY}/admin/index/status`)).body.state).toBe('IDLE')
    expect((await call(`${LIBRARY}/admin/index`, { method: 'POST' })).status).toBe(202)
    expect((await call(`${LIBRARY}/admin/index`, { method: 'POST' })).body.code).toBe('INDEX_ALREADY_RUNNING')

    const states = []
    for (let i = 0; i < 4; i += 1) states.push((await call(`${LIBRARY}/admin/index/status`)).body.state)
    expect(states).toEqual(['RUNNING', 'RUNNING', 'RUNNING', 'COMPLETED'])
  })

  it('modifie et supprime une entrée du catalogue', async () => {
    await login('admin')
    const { id } = mediaPage.items[0]
    const patched = await call(`${LIBRARY}/admin/media/${id}`, { method: 'PATCH', body: { title: 'Nouveau titre' } })
    expect(patched.body.title).toBe('Nouveau titre')
    expect((await call(`${LIBRARY}/admin/media/${id}`, { method: 'PATCH', body: { title: '' } })).status).toBe(400)
    expect((await call(`${LIBRARY}/admin/media/${id}`, { method: 'DELETE' })).status).toBe(204)
    expect((await call(`${LIBRARY}/media/${id}`)).status).toBe(404)
  })
})

describe('acquisition', () => {
  it('exige l’acquittement des droits avant un téléchargement, puis suit sa progression', async () => {
    await login('admin')
    const catalogue = (await call(`${ACQUISITION}/catalogue`)).body
    const entry = catalogue.items.find((e) => !e.inLibrary && !e.activeDownloadId)

    expect((await call(`${ACQUISITION}/rights-notice`)).body.acknowledged).toBe(false)
    const refused = await call(`${ACQUISITION}/downloads`, { method: 'POST', body: { catalogueEntryId: entry.id } })
    expect(refused.status).toBe(412)
    expect(refused.body.code).toBe('RIGHTS_NOT_ACKNOWLEDGED')

    const { version } = (await call(`${ACQUISITION}/rights-notice`)).body
    expect((await call(`${ACQUISITION}/rights-notice/ack`, { method: 'POST', body: { noticeVersion: 'ancienne' } })).status).toBe(409)
    expect((await call(`${ACQUISITION}/rights-notice/ack`, { method: 'POST', body: { noticeVersion: version } })).body.acknowledged).toBe(true)

    const started = await call(`${ACQUISITION}/downloads`, { method: 'POST', body: { catalogueEntryId: entry.id } })
    expect(started.status).toBe(202)
    expect(started.body.state).toBe('QUEUED')
    const again = await call(`${ACQUISITION}/downloads`, { method: 'POST', body: { catalogueEntryId: entry.id } })
    expect(again.body.code).toBe('DOWNLOAD_ALREADY_ACTIVE')

    const states = []
    for (let i = 0; i < 4; i += 1) states.push((await call(`${ACQUISITION}/downloads/${started.body.id}`)).body)
    expect(states.map((d) => d.state)).toEqual(['DOWNLOADING', 'DOWNLOADING', 'DOWNLOADING', 'COMPLETED'])
    expect(states.at(-1).libraryMediaId).toBeTruthy()

    const updated = (await call(`${ACQUISITION}/catalogue`)).body.items.find((e) => e.id === entry.id)
    expect(updated.inLibrary).toBe(true)
    expect((await call(`${ACQUISITION}/downloads/${started.body.id}/cancel`, { method: 'POST' })).body.code).toBe('CONFLICT')
  })

  it('annule un téléchargement en cours', async () => {
    await login('admin')
    const active = (await call(`${ACQUISITION}/downloads?state=DOWNLOADING`)).body.items[0]
    const cancelled = await call(`${ACQUISITION}/downloads/${active.id}/cancel`, { method: 'POST' })
    expect(cancelled.body.state).toBe('CANCELLED')
  })
})
