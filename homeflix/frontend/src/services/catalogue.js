import { apiFetch } from '@/services/api'

/**
 * Page du catalogue (`GET /media`). `page` commence à 0 comme dans le contrat ; `q`, `genre`,
 * `availability` et `sort` sont facultatifs (les valeurs vides sont ignorées).
 * @param {{page?: number, size?: number, q?: string, genre?: string, availability?: string, sort?: string}} [query]
 * @param {AbortSignal} [signal]
 * @returns {Promise<{items: object[], page: number, size: number, total: number, totalPages: number}>}
 */
export const listMedia = (query = {}, signal) => apiFetch('library', '/v1/media', { query, signal })

/**
 * Détail d'un média (`GET /media/{id}`). Lève une `ApiError` `NOT_FOUND` s'il n'existe pas ou a été supprimé.
 * @param {string} mediaId
 * @param {AbortSignal} [signal]
 * @returns {Promise<{id: string, title: string, description?: string|null, posterUrl?: string|null,
 *   genres: string[], year?: number|null, durationSeconds?: number|null,
 *   availability: 'AVAILABLE'|'UNAVAILABLE'|'DOWNLOADING', addedAt: string}>}
 */
export const getMedia = (mediaId, signal) =>
  apiFetch('library', `/v1/media/${encodeURIComponent(mediaId)}`, { signal })

/**
 * Genres ayant au moins un média disponible (`GET /genres`), pour le sélecteur de filtre.
 * @param {AbortSignal} [signal]
 * @returns {Promise<string[]>}
 */
export const listGenres = (signal) => apiFetch('library', '/v1/genres', { signal })

const adminMediaPath = (mediaId) => `/v1/admin/media/${encodeURIComponent(mediaId)}`

/**
 * Corrige les métadonnées d'un média (`PATCH /admin/media/{id}`, ADMIN) ; seuls les champs fournis changent, et une
 * réindexation ne les écrase pas. Lève une `ApiError` : `VALIDATION_ERROR` (champs), `NOT_FOUND`.
 * @param {string} mediaId
 * @param {{title?: string, description?: string, genres?: string[], year?: number}} changes
 *   Titre 1 à 200 caractères, description 2000, 10 genres de 40 caractères, année de 1888 à 2100.
 * @returns {Promise<object>} Le média mis à jour.
 */
export const updateMedia = (mediaId, changes) =>
  apiFetch('library', adminMediaPath(mediaId), { method: 'PATCH', body: changes })

/**
 * Retire une entrée du catalogue (`DELETE /admin/media/{id}`, ADMIN). Le fichier source n'est jamais modifié ni
 * supprimé, et l'entrée est exclue des réindexations suivantes.
 * @param {string} mediaId
 */
export const deleteMedia = (mediaId) => apiFetch('library', adminMediaPath(mediaId), { method: 'DELETE' })
