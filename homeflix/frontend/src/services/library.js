import { apiFetch } from '@/services/api'

/**
 * Sections de l'accueil du profil actif (toujours les quatre, éventuellement vides).
 * @param {AbortSignal} [signal]
 * @returns {Promise<{continueWatching: {media: object, progress: object}[], recentlyAdded: object[],
 *   categories: {genre: string, items: object[]}[], favourites: object[]}>}
 */
export const getHome = (signal) => apiFetch('library', '/v1/home', { signal })

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
export const getProgress = (mediaId, signal) => apiFetch('library', progressPath(mediaId), { signal })

/**
 * Enregistre la position de lecture (`PUT /media/{id}/progress`, idempotent) ; le serveur borne la position
 * et passe l'état à `COMPLETED` à partir de 95 %. `keepalive` laisse la requête aboutir à la fermeture de la
 * page (`sendBeacon` ne peut pas envoyer l'en-tête `Authorization`).
 * @param {string} mediaId
 * @param {{positionSeconds: number, durationSeconds: number}} position Entiers ; durée d'au moins 1 s.
 * @param {{keepalive?: boolean}} [options]
 */
export const saveProgress = (mediaId, position, { keepalive } = {}) =>
  apiFetch('library', progressPath(mediaId), { method: 'PUT', body: position, keepalive })

/** Réinitialise la progression (« Recommencer ») : le média repasse à `NOT_STARTED`. */
export const resetProgress = (mediaId) => apiFetch('library', progressPath(mediaId), { method: 'DELETE' })

/**
 * « Ma liste » du profil actif (`GET /me/favourites`), les ajouts les plus récents en premier.
 * @param {{page?: number, size?: number}} [query]
 * @param {AbortSignal} [signal]
 * @returns {Promise<{items: object[], page: number, size: number, total: number, totalPages: number}>}
 */
export const listFavourites = (query = {}, signal) => apiFetch('library', '/v1/me/favourites', { query, signal })

/**
 * Dossiers autorisés (`GET /admin/media-roots`, ADMIN).
 * @param {AbortSignal} [signal]
 * @returns {Promise<{id: string, path: string, label: string, enabled: boolean, createdAt: string}[]>}
 */
export async function listMediaRoots(signal) {
  const roots = await apiFetch('library', '/v1/admin/media-roots', { signal })
  if (!Array.isArray(roots)) throw new TypeError('Réponse inattendue du serveur pour la liste des dossiers.')
  return roots
}

/**
 * Vérifie un chemin sans l'enregistrer (`POST /admin/media-roots/validate`) : répond toujours 200, le résultat
 * dit si le dossier est utilisable (`valid`) et sinon pourquoi (`code`, `message`).
 * @param {{path: string, label?: string}} root
 * @returns {Promise<{valid: boolean, code?: string, message?: string}>}
 */
export const validateMediaRoot = (root) =>
  apiFetch('library', '/v1/admin/media-roots/validate', { method: 'POST', body: root })

/**
 * Ajoute un dossier autorisé (`POST /admin/media-roots`). Le serveur le valide à nouveau et lève une `ApiError` :
 * `ROOT_NOT_FOUND`, `ROOT_NOT_A_DIRECTORY`, `ROOT_NOT_READABLE`, `ROOT_NOT_ALLOWED` ou `ROOT_OVERLAP` (409).
 * @param {{path: string, label?: string}} root
 */
export const addMediaRoot = (root) => apiFetch('library', '/v1/admin/media-roots', { method: 'POST', body: root })

/**
 * Retire un dossier autorisé (`DELETE /admin/media-roots/{id}`) : ses films deviennent indisponibles, aucun fichier
 * n'est supprimé.
 * @param {string} rootId
 */
export const deleteMediaRoot = (rootId) =>
  apiFetch('library', `/v1/admin/media-roots/${encodeURIComponent(rootId)}`, { method: 'DELETE' })

/**
 * Lance une indexation manuelle (`POST /admin/index`, 202) : scan asynchrone de tous les dossiers actifs, idempotent.
 * Un seul scan à la fois : `INDEX_ALREADY_RUNNING` (409) si l'un tourne déjà.
 * @returns {Promise<IndexJob>}
 */
export const startIndexing = () => apiFetch('library', '/v1/admin/index', { method: 'POST' })

/**
 * État de la dernière indexation (`GET /admin/index/status`).
 * @param {AbortSignal} [signal]
 * @returns {Promise<IndexJob>}
 * @typedef {object} IndexJob
 * @property {string} jobId
 * @property {'IDLE'|'RUNNING'|'COMPLETED'|'FAILED'} state
 * @property {number} [scanned] Fichiers analysés.
 * @property {number} [added]
 * @property {number} [updated]
 * @property {number} [markedUnavailable] Films dont le fichier a disparu.
 * @property {number} [duplicates]
 * @property {number} [errors]
 * @property {string|null} [startedAt]
 * @property {string|null} [finishedAt]
 */
export const getIndexStatus = (signal) => apiFetch('library', '/v1/admin/index/status', { signal })

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
