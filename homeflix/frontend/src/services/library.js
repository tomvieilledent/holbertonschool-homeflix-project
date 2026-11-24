import { apiFetch } from '@/services/api'

/**
 * Sections de l'accueil du profil actif (toujours les quatre, éventuellement vides).
 * @param {AbortSignal} [signal]
 * @returns {Promise<{continueWatching: {media: object, progress: object}[], recentlyAdded: object[],
 *   categories: {genre: string, items: object[]}[], favourites: object[]}>}
 */
export const getHome = (signal) => apiFetch('library', '/v1/home', { signal })

// Écritures de progression en cours, par film. La position est enregistrée en tâche de fond quand on quitte le
// lecteur, pendant que la fiche charge déjà la progression : sans attente, la lecture pourrait dépasser l'écriture
// et afficher l'ancienne position. `getProgress` attend donc les écritures du même film.
const pendingWrites = new Map()

/** Suit une écriture de progression ; renvoie la requête telle quelle (l'échec reste l'affaire de l'appelant). */
function trackWrite(mediaId, request) {
  const settled = request.then(
    () => {},
    () => {},
  )
  const tracking = Promise.all([pendingWrites.get(mediaId), settled]).then(() => {
    if (pendingWrites.get(mediaId) === tracking) pendingWrites.delete(mediaId)
  })
  pendingWrites.set(mediaId, tracking)
  return request
}

const progressPath = (mediaId) => `/v1/media/${encodeURIComponent(mediaId)}/progress`
const favouritePath = (mediaId) => `/v1/me/favourites/${encodeURIComponent(mediaId)}`

/** Ajoute un média à « Ma liste » (idempotent). */
export const addFavourite = (mediaId) => apiFetch('library', favouritePath(mediaId), { method: 'PUT' })

/** Retire un média de « Ma liste » (idempotent). */
export const removeFavourite = (mediaId) => apiFetch('library', favouritePath(mediaId), { method: 'DELETE' })

/**
 * Progression du profil actif sur un média (`GET /media/{id}/progress`) : `NOT_STARTED` (position 0),
 * `STARTED` ou `COMPLETED`.
 * @param {string} mediaId
 * @param {AbortSignal} [signal]
 * @returns {Promise<{mediaId: string, positionSeconds: number, durationSeconds?: number|null,
 *   state: 'NOT_STARTED'|'STARTED'|'COMPLETED', updatedAt?: string|null}>}
 */
export async function getProgress(mediaId, signal) {
  await pendingWrites.get(mediaId) // lire après sa propre écriture (voir `trackWrite`)
  return apiFetch('library', progressPath(mediaId), { signal })
}

/**
 * Enregistre la position de lecture (`PUT /media/{id}/progress`, idempotent) ; le serveur borne la position
 * et passe l'état à `COMPLETED` à partir de 95 %. `keepalive` laisse la requête aboutir à la fermeture de la
 * page (`sendBeacon` ne peut pas envoyer l'en-tête `Authorization`).
 * @param {string} mediaId
 * @param {{positionSeconds: number, durationSeconds: number}} position Entiers ; durée d'au moins 1 s.
 * @param {{keepalive?: boolean}} [options]
 */
export const saveProgress = (mediaId, position, { keepalive } = {}) =>
  trackWrite(mediaId, apiFetch('library', progressPath(mediaId), { method: 'PUT', body: position, keepalive }))

/** Réinitialise la progression (« Recommencer ») : le média repasse à `NOT_STARTED`. */
export const resetProgress = (mediaId) =>
  trackWrite(mediaId, apiFetch('library', progressPath(mediaId), { method: 'DELETE' }))

/**
 * « Ma liste » du profil actif (`GET /me/favourites`), les ajouts les plus récents en premier.
 * @param {{page?: number, size?: number}} [query]
 * @param {AbortSignal} [signal]
 * @returns {Promise<{items: object[], page: number, size: number, total: number, totalPages: number}>}
 */
export const listFavourites = (query = {}, signal) => apiFetch('library', '/v1/me/favourites', { query, signal })

const FAVOURITES_PAGE_SIZE = 50
const FAVOURITES_MAX_PAGES = 20 // garde-fou : 1 000 favoris au plus

/**
 * Tous les favoris du profil actif, les plus récents en premier (parcourt les pages de `GET /me/favourites`).
 * @param {AbortSignal} [signal]
 * @returns {Promise<object[]>}
 */
export async function listAllFavourites(signal) {
  const items = []
  for (let page = 0; page < FAVOURITES_MAX_PAGES; page += 1) {
    const result = await listFavourites({ page, size: FAVOURITES_PAGE_SIZE }, signal)
    if (!Array.isArray(result?.items)) throw new TypeError('Réponse inattendue pour « Ma liste »')
    items.push(...result.items)
    if (page + 1 >= result.totalPages) break
  }
  return items
}
