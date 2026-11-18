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
