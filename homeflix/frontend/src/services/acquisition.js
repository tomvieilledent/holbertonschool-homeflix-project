import { apiFetch } from '@/services/api'

/**
 * Catalogue des contenus autorisés (`GET /catalogue`, ADMIN) : seules les entrées avec une licence et une preuve de
 * licence, sans lien magnet ni empreinte. `page` commence à 0.
 * @param {{page?: number, size?: number}} [query]
 * @param {AbortSignal} [signal]
 * @returns {Promise<{items: CatalogueEntry[], page: number, size: number, total: number, totalPages: number}>}
 * @typedef {object} CatalogueEntry
 * @property {string} id
 * @property {string} title
 * @property {string} source Organisme ou site d'origine.
 * @property {string} license Licence ou autorisation de redistribution.
 * @property {string} licenseProofUrl Page officielle prouvant la licence.
 * @property {number} sizeBytes
 * @property {boolean} inLibrary Le fichier est déjà dans la bibliothèque.
 * @property {string|null} [libraryMediaId]
 * @property {string|null} [activeDownloadId]
 */
export async function listCatalogue(query = {}, signal) {
  const page = await apiFetch('acquisition', '/v1/catalogue', { query, signal })
  if (!Array.isArray(page?.items)) throw new TypeError('Réponse inattendue du serveur pour le catalogue.')
  return page
}

/**
 * Rappel des droits et état d'acquittement du compte (`GET /rights-notice`).
 * @param {AbortSignal} [signal]
 * @returns {Promise<{version: string, text: string, acknowledged: boolean, acknowledgedAt?: string|null}>}
 */
export const getRightsNotice = (signal) => apiFetch('acquisition', '/v1/rights-notice', { signal })

/**
 * Acquitte le rappel des droits (`POST /rights-notice/ack`), une fois par compte et par version (idempotent). Lève une
 * `ApiError` `CONFLICT` (409) si `noticeVersion` n'est plus la version courante : il faut relire le rappel.
 * @param {string} noticeVersion Version lue par l'administrateur.
 */
export const acknowledgeRights = (noticeVersion) =>
  apiFetch('acquisition', '/v1/rights-notice/ack', { method: 'POST', body: { noticeVersion } })

/**
 * Démarre le téléchargement d'une entrée du catalogue (`POST /downloads`). Le corps ne contient **que** l'identifiant
 * de l'entrée : aucune adresse n'est jamais envoyée. Lève une `ApiError` : `RIGHTS_NOT_ACKNOWLEDGED` (412),
 * `DOWNLOAD_ALREADY_ACTIVE` ou `CONFLICT` (409), `TORRENT_CLIENT_UNAVAILABLE` (503).
 * @param {string} catalogueEntryId
 * @returns {Promise<{id: string, title: string, state: string, progressPercent: number}>}
 */
export const startDownload = (catalogueEntryId) =>
  apiFetch('acquisition', '/v1/downloads', { method: 'POST', body: { catalogueEntryId } })

/**
 * Téléchargements, du plus récent au plus ancien (`GET /downloads`, ADMIN). `page` commence à 0 ; `state` filtre par
 * état (`QUEUED`, `DOWNLOADING`, `COMPLETED`, `FAILED`, `CANCELLED`).
 * @param {{page?: number, size?: number, state?: string}} [query]
 * @param {AbortSignal} [signal]
 * @returns {Promise<{items: Download[], page: number, size: number, total: number, totalPages: number}>}
 * @typedef {object} Download
 * @property {string} id
 * @property {string} catalogueEntryId
 * @property {string} title
 * @property {'QUEUED'|'DOWNLOADING'|'COMPLETED'|'FAILED'|'CANCELLED'} state `COMPLETED`, `FAILED` et `CANCELLED` sont terminaux.
 * @property {number} progressPercent 0 à 100.
 * @property {string|null} [errorCode] Présent si `FAILED` (`NO_PEERS`, `DISK_FULL`, `TORRENT_CLIENT_UNAVAILABLE`).
 * @property {string|null} [libraryMediaId] Média indexé une fois le fichier arrivé dans la bibliothèque.
 * @property {string} createdAt
 * @property {string|null} [finishedAt]
 */
export async function listDownloads(query = {}, signal) {
  const page = await apiFetch('acquisition', '/v1/downloads', { query, signal })
  if (!Array.isArray(page?.items)) throw new TypeError('Réponse inattendue du serveur pour les téléchargements.')
  return page
}

/**
 * Annule un téléchargement en file ou en cours (`POST /downloads/{id}/cancel`) et renvoie son nouvel état ; annuler un
 * téléchargement déjà annulé répond `200` (idempotent). Lève une `ApiError`
 * `CONFLICT` (409) s'il est déjà terminé (`COMPLETED`) ou échoué (`FAILED`).
 * @param {string} downloadId
 * @returns {Promise<Download>}
 */
export const cancelDownload = (downloadId) =>
  apiFetch('acquisition', `/v1/downloads/${encodeURIComponent(downloadId)}/cancel`, { method: 'POST' })
