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
 * Genres ayant au moins un média disponible (`GET /genres`), pour le sélecteur de filtre.
 * @param {AbortSignal} [signal]
 * @returns {Promise<string[]>}
 */
export const listGenres = (signal) => apiFetch('library', '/v1/genres', { signal })
