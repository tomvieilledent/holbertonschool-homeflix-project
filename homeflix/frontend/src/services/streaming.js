import { apiFetch } from '@/services/api'
import { ApiError } from '@/services/apiError'

/**
 * Ticket de streaming signé (`POST /media/{id}/stream-ticket`). Une balise `<video>` ne peut pas envoyer
 * `Authorization` : on demande ce ticket, puis on charge `url` (ticket inclus, valable 2 h, lié au média
 * et au profil actif). Lève une `ApiError` (`MEDIA_UNAVAILABLE`, `MEDIA_FILE_MISSING`, `PROFILE_NOT_SELECTED`…).
 * @param {string} mediaId
 * @param {AbortSignal} [signal]
 * @returns {Promise<{url: string, expiresAt: string}>}
 */
export const getStreamTicket = (mediaId, signal) =>
  apiFetch('library', `/v1/media/${encodeURIComponent(mediaId)}/stream-ticket`, { method: 'POST', signal })

// Le flux répond parfois sans corps problem+json : le statut dit alors de quoi il s'agit.
const STREAM_CODE_BY_STATUS = { 401: 'TICKET_EXPIRED', 404: 'MEDIA_FILE_MISSING', 415: 'MEDIA_UNSUPPORTED_FORMAT' }

/**
 * Cherche pourquoi une balise `<video>` n'arrive pas à lire le flux : elle ne dit jamais le statut HTTP
 * (404, 403, 415 ou ticket expiré donnent tous « format non supporté »). On redemande donc le premier octet.
 * @param {string} url URL du flux, ticket inclus.
 * @param {AbortSignal} [signal]
 * @returns {Promise<ApiError|null>} L'erreur du flux (`TICKET_EXPIRED`, `MEDIA_FILE_MISSING`,
 *   `ACCESS_DENIED`, `MEDIA_UNSUPPORTED_FORMAT`, `NETWORK_ERROR`…), ou `null` si le flux répond normalement.
 */
export async function diagnoseStream(url, signal) {
  let response
  try {
    response = await fetch(url, { headers: { Range: 'bytes=0-0' }, signal })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    return new ApiError(0, 'NETWORK_ERROR')
  }
  if (response.ok) {
    response.body?.cancel().catch(() => {}) // on n'a besoin que du statut, pas de la vidéo
    return null
  }
  const problem = await response.json().catch(() => null)
  return new ApiError(response.status, problem?.code ?? STREAM_CODE_BY_STATUS[response.status])
}
