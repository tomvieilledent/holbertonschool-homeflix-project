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
