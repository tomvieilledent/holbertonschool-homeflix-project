import { userMessage } from '@/services/errorMessages'

// Codes de `MediaError` (balise <video>).
export const MEDIA_ERR_ABORTED = 1
export const MEDIA_ERR_DECODE = 3
export const MEDIA_ERR_SRC_NOT_SUPPORTED = 4

/**
 * Que faire d'un échec de lecture ?
 *
 * `failure` est le diagnostic du flux (`diagnoseStream`) : l'erreur renvoyée par le serveur, `NETWORK_ERROR` si
 * le serveur est injoignable, ou `null` si le flux répond normalement. Un ticket expiré, ou un échec dont on
 * ne trouve pas la cause, donne un nouveau ticket automatique (une seule fois). Sinon on montre un message clair,
 * sans détail technique.
 *
 * @param {{mediaErrorCode?: number, failure: import('@/services/apiError').ApiError|null, canRefresh: boolean}} input
 * @returns {{type: 'ignore'} | {type: 'refresh'} | {type: 'error', message: string}}
 */
export function resolvePlaybackFailure({ mediaErrorCode, failure, canRefresh }) {
  if (mediaErrorCode === MEDIA_ERR_ABORTED) return { type: 'ignore' } // lecture interrompue par l'utilisateur
  if (failure?.code === 'NETWORK_ERROR') return { type: 'error', message: failure.message }
  if ((failure === null || failure.code === 'TICKET_EXPIRED') && canRefresh) return { type: 'refresh' }
  if (failure) return { type: 'error', message: failure.message }
  // Le flux répond mais le navigateur ne peut pas le lire.
  const code =
    mediaErrorCode === MEDIA_ERR_SRC_NOT_SUPPORTED
      ? 'MEDIA_UNSUPPORTED_FORMAT'
      : mediaErrorCode === MEDIA_ERR_DECODE
        ? 'MEDIA_DECODE_FAILED'
        : 'MEDIA_PLAYBACK_FAILED'
  return { type: 'error', message: userMessage(code) }
}
