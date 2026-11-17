import { HttpResponse } from 'msw'

// Un problem+json par code métier, tels que documentés dans docs/api/fixtures/errors.
const bodies = import.meta.glob('@fixtures/errors/*.json', { eager: true, import: 'default' })
const errors = Object.fromEntries(
  Object.entries(bodies).map(([path, body]) => [path.split('/').pop().replace('.json', ''), body]),
)

/**
 * Réponse d'erreur `application/problem+json` à partir d'une fixture.
 * @param {string} name Nom du fichier de fixture sans extension (ex. `not-found`).
 * @param {object} [overrides] Champs à remplacer (ex. `detail`).
 */
export function problem(name, overrides = {}) {
  const body = { ...errors[name], ...overrides }
  return HttpResponse.json(body, {
    status: body.status,
    headers: { 'Content-Type': 'application/problem+json' },
  })
}

export const noContent = () => new HttpResponse(null, { status: 204 })

/**
 * Vérifie la session. Retourne `{ error }` (réponse prête à renvoyer) ou `{ account, profileId }`.
 * @param {ReturnType<import('@/mocks/db').createDb>} db
 * @param {Request} request
 * @param {{ admin?: boolean, profile?: boolean }} [required] Rôle ADMIN et/ou profil actif exigés.
 */
export function authenticate(db, request, { admin = false, profile = false } = {}) {
  const header = request.headers.get('Authorization')
  const account = db.accounts.find((a) => a.id === db.session?.accountId)
  if (!header?.startsWith('Bearer ') || !account?.enabled) return { error: problem('session-expired') }
  if (admin && account.role !== 'ADMIN') return { error: problem('access-denied') }
  if (profile && !db.session.activeProfileId) return { error: problem('profile-not-selected') }
  return { account, profileId: db.session.activeProfileId }
}

/** Pagination `page` / `size` (0-indexée) d'une liste, au format des contrats. */
export function paginate(items, url, defaultSize = 20) {
  const page = Math.max(0, Number(url.searchParams.get('page') ?? 0) || 0)
  const size = Math.min(50, Math.max(1, Number(url.searchParams.get('size') ?? defaultSize) || defaultSize))
  return {
    items: items.slice(page * size, (page + 1) * size),
    page,
    size,
    total: items.length,
    totalPages: Math.ceil(items.length / size),
  }
}

export const readJson = (request) => request.json().catch(() => ({}))
