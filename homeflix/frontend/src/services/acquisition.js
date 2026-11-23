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
