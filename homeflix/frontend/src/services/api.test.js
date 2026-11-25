import { delay, http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetProfile, rememberedProfile, rememberProfile } from '@/services/activeProfile'
import {
  ApiError,
  apiFetch,
  getAccessToken,
  isAbortError,
  onSessionExpired,
  setAccessToken,
} from '@/services/api'

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())

const TECHNICAL_DETAIL = 'java.lang.NullPointerException at com.homeflix.library.MediaService:42'

const problem = (status, code, extra = {}) =>
  HttpResponse.json(
    { type: 'about:blank', title: 'x', status, code, detail: TECHNICAL_DETAIL, ...extra },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  )

const MEDIA = '*/api/library/v1/media'
const REFRESH = '*/api/identity/v1/auth/refresh'

/** Endpoint protégé : accepte uniquement le jeton renouvelé. */
function protectedMedia(seen) {
  return http.get(MEDIA, ({ request }) => {
    const auth = request.headers.get('Authorization')
    seen.push(auth)
    return auth === 'Bearer nouveau-jeton' ? HttpResponse.json({ ok: true }) : problem(401, 'SESSION_EXPIRED')
  })
}

function refreshReturning(counter, token = 'nouveau-jeton') {
  return http.post(REFRESH, () => {
    counter.count += 1
    return HttpResponse.json({ accessToken: token, expiresIn: 900, tokenType: 'Bearer' })
  })
}

let unsubscribe
beforeEach(() => {
  server.resetHandlers()
  setAccessToken('ancien-jeton')
  forgetProfile()
})
afterEach(() => unsubscribe?.())

describe('jeton', () => {
  it('ajoute l’en-tête Authorization', async () => {
    let seen
    server.use(
      http.get(MEDIA, ({ request }) => {
        seen = request.headers.get('Authorization')
        return HttpResponse.json({ ok: true })
      }),
    )
    await apiFetch('library', '/v1/media')
    expect(seen).toBe('Bearer ancien-jeton')
  })

  it('n’envoie aucun jeton pour un endpoint anonyme (auth: false)', async () => {
    let seen = 'non appelé'
    server.use(
      http.post('*/api/identity/v1/auth/login', ({ request }) => {
        seen = request.headers.get('Authorization')
        return HttpResponse.json({ accessToken: 'x', expiresIn: 900, tokenType: 'Bearer' })
      }),
    )
    await apiFetch('identity', '/v1/auth/login', { method: 'POST', auth: false, body: { username: 'a', password: 'b' } })
    expect(seen).toBeNull()
  })
})

describe('refresh automatique sur 401', () => {
  it('rafraîchit puis rejoue la requête une seule fois', async () => {
    const seen = []
    const refresh = { count: 0 }
    server.use(protectedMedia(seen), refreshReturning(refresh))

    await expect(apiFetch('library', '/v1/media')).resolves.toEqual({ ok: true })
    expect(refresh.count).toBe(1)
    expect(seen).toEqual(['Bearer ancien-jeton', 'Bearer nouveau-jeton'])
    expect(getAccessToken()).toBe('nouveau-jeton')
  })

  it('envoie l’en-tête X-Requested-With au refresh', async () => {
    let header
    server.use(
      protectedMedia([]),
      http.post(REFRESH, ({ request }) => {
        header = request.headers.get('X-Requested-With')
        return HttpResponse.json({ accessToken: 'nouveau-jeton', expiresIn: 900, tokenType: 'Bearer' })
      }),
    )
    await apiFetch('library', '/v1/media')
    expect(header).toBe('homeflix')
  })

  it('partage un seul refresh entre requêtes simultanées (jeton à usage unique)', async () => {
    const refresh = { count: 0 }
    server.use(protectedMedia([]), refreshReturning(refresh))
    const results = await Promise.all([apiFetch('library', '/v1/media'), apiFetch('library', '/v1/media')])
    expect(results).toEqual([{ ok: true }, { ok: true }])
    expect(refresh.count).toBe(1)
  })

  it('session perdue : refresh refusé → handler appelé, erreur SESSION_EXPIRED', async () => {
    const handler = vi.fn()
    unsubscribe = onSessionExpired(handler)
    server.use(protectedMedia([]), http.post(REFRESH, () => problem(401, 'SESSION_EXPIRED')))

    const error = await apiFetch('library', '/v1/media').catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe('SESSION_EXPIRED')
    expect(error.message).toBe('Votre session a expiré. Reconnectez-vous pour continuer.')
    expect(handler).toHaveBeenCalledTimes(1)
    expect(getAccessToken()).toBeNull()
  })

  it('ne boucle pas : un second 401 après refresh met fin à la session', async () => {
    const handler = vi.fn()
    unsubscribe = onSessionExpired(handler)
    const refresh = { count: 0 }
    let calls = 0
    server.use(
      http.get(MEDIA, () => {
        calls += 1
        return problem(401, 'SESSION_EXPIRED')
      }),
      refreshReturning(refresh),
    )

    await expect(apiFetch('library', '/v1/media')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' })
    expect(calls).toBe(2)
    expect(refresh.count).toBe(1)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('une panne réseau pendant le refresh ne déclare pas la session perdue', async () => {
    const handler = vi.fn()
    unsubscribe = onSessionExpired(handler)
    server.use(protectedMedia([]), http.post(REFRESH, () => HttpResponse.error()))

    await expect(apiFetch('library', '/v1/media')).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
    expect(handler).not.toHaveBeenCalled()
  })

  it.each(['AUTH_INVALID_CREDENTIALS', 'TICKET_EXPIRED'])('ne rafraîchit pas pour un 401 %s', async (code) => {
    const refresh = { count: 0 }
    server.use(http.get(MEDIA, () => problem(401, code)), refreshReturning(refresh))
    await expect(apiFetch('library', '/v1/media')).rejects.toMatchObject({ code })
    expect(refresh.count).toBe(0)
  })

  it('ne rafraîchit pas pour un endpoint anonyme', async () => {
    const refresh = { count: 0 }
    server.use(
      http.post('*/api/identity/v1/auth/login', () => problem(401, 'AUTH_INVALID_CREDENTIALS')),
      refreshReturning(refresh),
    )
    const error = await apiFetch('identity', '/v1/auth/login', { method: 'POST', auth: false, body: {} }).catch((e) => e)
    expect(error.message).toBe('Identifiant ou mot de passe incorrect.')
    expect(refresh.count).toBe(0)
  })
})

describe('erreurs lisibles', () => {
  it('affiche un message français d’après le code, jamais le detail technique', async () => {
    server.use(http.get(MEDIA, () => problem(404, 'MEDIA_FILE_MISSING')))
    const error = await apiFetch('library', '/v1/media').catch((e) => e)
    expect(error.status).toBe(404)
    expect(error.code).toBe('MEDIA_FILE_MISSING')
    expect(error.message).toBe('Le fichier de ce film est introuvable.')
    expect(error.message).not.toContain('NullPointer')
    expect(JSON.stringify(error.message)).not.toContain('com.homeflix')
  })

  it('expose les erreurs de champ d’une validation', async () => {
    server.use(
      http.get(MEDIA, () =>
        problem(400, 'VALIDATION_ERROR', { errors: [{ field: 'title', message: 'Ne peut pas être vide' }] }),
      ),
    )
    const error = await apiFetch('library', '/v1/media').catch((e) => e)
    expect(error.fieldErrors).toEqual({ title: 'Ne peut pas être vide' })
  })

  it('lit Retry-After sur un 429', async () => {
    server.use(
      http.get(MEDIA, () =>
        HttpResponse.json({ status: 429, code: 'RATE_LIMITED' }, { status: 429, headers: { 'Retry-After': '30' } }),
      ),
    )
    const error = await apiFetch('library', '/v1/media').catch((e) => e)
    expect(error.code).toBe('RATE_LIMITED')
    expect(error.retryAfter).toBe(30)
  })

  it('choisit un message d’après le statut quand la réponse n’est pas un problem+json', async () => {
    server.use(
      http.get(MEDIA, () => new HttpResponse('<html>502 Bad Gateway nginx/1.27</html>', { status: 502 })),
    )
    const error = await apiFetch('library', '/v1/media').catch((e) => e)
    expect(error.code).toBeUndefined()
    expect(error.message).toBe('Le service est momentanément indisponible. Réessayez dans un instant.')
    expect(error.message).not.toContain('nginx')
  })

  it('signale un serveur injoignable', async () => {
    server.use(http.get(MEDIA, () => HttpResponse.error()))
    const error = await apiFetch('library', '/v1/media').catch((e) => e)
    expect(error.status).toBe(0)
    expect(error.code).toBe('NETWORK_ERROR')
    expect(error.message).toBe('Impossible de joindre le serveur. Vérifiez votre connexion.')
  })
})

describe('annulation', () => {
  it('rejette avec une AbortError, sans refresh ni message d’erreur', async () => {
    const refresh = { count: 0 }
    server.use(
      http.get(MEDIA, async () => {
        await delay('infinite')
        return HttpResponse.json({})
      }),
      refreshReturning(refresh),
    )
    const controller = new AbortController()
    const pending = apiFetch('library', '/v1/media', { signal: controller.signal }).catch((e) => e)
    controller.abort()
    const error = await pending
    expect(isAbortError(error)).toBe(true)
    expect(error).not.toBeInstanceOf(ApiError)
    expect(refresh.count).toBe(0)
  })

  it('une requête déjà annulée ne part pas', async () => {
    let called = false
    server.use(http.get(MEDIA, () => ((called = true), HttpResponse.json({}))))
    const controller = new AbortController()
    controller.abort()
    const error = await apiFetch('library', '/v1/media', { signal: controller.signal }).catch((e) => e)
    expect(isAbortError(error)).toBe(true)
    expect(called).toBe(false)
  })
})

describe('requêtes', () => {
  it('sérialise le corps JSON et les paramètres, en ignorant les valeurs vides', async () => {
    server.use(
      http.post('*/api/library/v1/echo', async ({ request }) =>
        HttpResponse.json({
          search: new URL(request.url).search,
          body: await request.json(),
          contentType: request.headers.get('Content-Type'),
        }),
      ),
    )
    const result = await apiFetch('library', '/v1/echo', {
      method: 'POST',
      query: { page: 2, size: 10, q: '', genre: undefined },
      body: { title: 'Sintel' },
    })
    expect(result).toEqual({ search: '?page=2&size=10', body: { title: 'Sintel' }, contentType: 'application/json' })
  })

  it('renvoie null pour une réponse 204', async () => {
    server.use(http.delete('*/api/library/v1/thing', () => new HttpResponse(null, { status: 204 })))
    await expect(apiFetch('library', '/v1/thing', { method: 'DELETE' })).resolves.toBeNull()
  })
})

describe('profil actif après un renouvellement du jeton', () => {
  const SELECT = '*/api/identity/v1/profiles/:profileId/select'
  const WITH_PROFILE = 'jeton-avec-profil'

  /** Le refresh renvoie un jeton sans profil ; seul le jeton issu de la sélection ouvre la bibliothèque. */
  function protectedByProfile(seen) {
    return http.get(MEDIA, ({ request }) => {
      const auth = request.headers.get('Authorization')
      seen.push(auth)
      if (auth === `Bearer ${WITH_PROFILE}`) return HttpResponse.json({ ok: true })
      return auth === 'Bearer ancien-jeton' ? problem(401, 'SESSION_EXPIRED') : problem(409, 'PROFILE_NOT_SELECTED')
    })
  }

  function selecting(calls, behaviour = () => HttpResponse.json({ accessToken: WITH_PROFILE })) {
    return http.post(SELECT, ({ request, params }) => {
      calls.push({ profileId: params.profileId, auth: request.headers.get('Authorization') })
      return behaviour()
    })
  }

  it('ré-sélectionne le profil retenu et rejoue la requête avec le jeton qui porte le profil', async () => {
    rememberProfile('p1')
    const refresh = { count: 0 }
    const seen = []
    const selects = []
    server.use(protectedByProfile(seen), refreshReturning(refresh), selecting(selects))

    await expect(apiFetch('library', '/v1/media')).resolves.toEqual({ ok: true })
    expect(refresh.count).toBe(1)
    expect(selects).toEqual([{ profileId: 'p1', auth: 'Bearer nouveau-jeton' }])
    expect(seen).toEqual(['Bearer ancien-jeton', `Bearer ${WITH_PROFILE}`])
    expect(getAccessToken()).toBe(WITH_PROFILE)
  })

  it('sans profil retenu, ne fait aucune sélection', async () => {
    const refresh = { count: 0 }
    const selects = []
    server.use(protectedMedia([]), refreshReturning(refresh), selecting(selects))
    await apiFetch('library', '/v1/media')
    expect(selects).toHaveLength(0)
  })

  it('un seul refresh et une seule sélection pour des requêtes simultanées', async () => {
    rememberProfile('p1')
    const refresh = { count: 0 }
    const selects = []
    server.use(protectedByProfile([]), refreshReturning(refresh), selecting(selects))
    await Promise.all([
      apiFetch('library', '/v1/media'),
      apiFetch('library', '/v1/media'),
      apiFetch('library', '/v1/media'),
    ])
    expect(refresh.count).toBe(1)
    expect(selects).toHaveLength(1)
  })

  it('oublie un profil introuvable (supprimé) et garde la session, sans profil actif', async () => {
    rememberProfile('supprime')
    const refresh = { count: 0 }
    const selects = []
    server.use(protectedMedia([]), refreshReturning(refresh), selecting(selects, () => problem(404, 'NOT_FOUND')))

    await expect(apiFetch('library', '/v1/media')).resolves.toEqual({ ok: true })
    expect(rememberedProfile()).toBeNull()
    expect(getAccessToken()).toBe('nouveau-jeton')
  })

  it('une panne de la sélection ne fait pas perdre la session et garde le profil pour plus tard', async () => {
    rememberProfile('p1')
    const refresh = { count: 0 }
    const lost = vi.fn()
    unsubscribe = onSessionExpired(lost)
    server.use(protectedMedia([]), refreshReturning(refresh), selecting([], () => problem(500, 'INTERNAL_ERROR')))

    await expect(apiFetch('library', '/v1/media')).resolves.toEqual({ ok: true })
    expect(lost).not.toHaveBeenCalled()
    expect(rememberedProfile()).toBe('p1')
  })

  it('une session perdue oublie le profil retenu', async () => {
    rememberProfile('p1')
    unsubscribe = onSessionExpired(() => {})
    server.use(
      http.get(MEDIA, () => problem(401, 'SESSION_EXPIRED')),
      http.post(REFRESH, () => problem(401, 'SESSION_EXPIRED')),
    )
    await expect(apiFetch('library', '/v1/media')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' })
    expect(rememberedProfile()).toBeNull()
  })
})
