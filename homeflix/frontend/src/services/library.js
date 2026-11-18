import { apiFetch } from '@/services/api'

/**
 * Sections de l'accueil du profil actif (toujours les quatre, éventuellement vides).
 * @param {AbortSignal} [signal]
 * @returns {Promise<{continueWatching: {media: object, progress: object}[], recentlyAdded: object[],
 *   categories: {genre: string, items: object[]}[], favourites: object[]}>}
 */
export const getHome = (signal) => apiFetch('library', '/v1/home', { signal })

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
export const getProgress = (mediaId, signal) =>
  apiFetch('library', `/v1/media/${encodeURIComponent(mediaId)}/progress`, { signal })

/**
 * « Ma liste » du profil actif (`GET /me/favourites`), les ajouts les plus récents en premier.
 * @param {{page?: number, size?: number}} [query]
 * @param {AbortSignal} [signal]
 * @returns {Promise<{items: object[], page: number, size: number, total: number, totalPages: number}>}
 */
export const listFavourites = (query = {}, signal) => apiFetch('library', '/v1/me/favourites', { query, signal })
