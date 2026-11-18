import { apiFetch } from '@/services/api'

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
