import { config } from '@/app/config'
import { forgetProfile, rememberedProfile } from '@/services/activeProfile'
import { ApiError } from '@/services/apiError'

export { ApiError }

/** Construit une URL relative : /api/<service>/v1/... (nginx en prod, proxy Vite en dev). */
export const apiUrl = (service, path) =>
  `${config.apiBase}/${service}${path.startsWith('/') ? path : `/${path}`}`

/** En-tête exigé avec le cookie `refresh_token` (voir identity.openapi.yaml). */
export const SESSION_HEADER = { 'X-Requested-With': 'homeflix' }

// L'access token reste en mémoire : jamais dans localStorage ni dans un cookie lisible par le JS.
let accessToken = null
let refreshing = null
let sessionExpiredHandler = () => {}

export const getAccessToken = () => accessToken
export const setAccessToken = (token) => {
  accessToken = token
}

/** `true` si l'erreur vient d'une requête annulée (AbortController) : à ignorer, pas à afficher. */
export const isAbortError = (error) => error?.name === 'AbortError'

/**
 * Enregistre ce qu'il faut faire quand la session est définitivement perdue (refresh refusé, compte désactivé).
 * @param {(code: 'SESSION_EXPIRED'|'ACCOUNT_DISABLED') => void} handler
 * @returns {() => void} Fonction de désinscription.
 */
export function onSessionExpired(handler) {
  sessionExpiredHandler = handler
  return () => {
    if (sessionExpiredHandler === handler) sessionExpiredHandler = () => {}
  }
}

const queryString = (query) => {
  const entries = Object.entries(query ?? {}).filter(
    ([, value]) => value !== undefined && value !== null && value !== '',
  )
  return entries.length ? `?${new URLSearchParams(entries)}` : ''
}

const serialize = (body) =>
  body !== null && typeof body === 'object' && !(body instanceof FormData) ? JSON.stringify(body) : body

/** Requête brute : ni jeton ni refresh. Convertit toute erreur en `ApiError`. */
async function request(service, path, { method = 'GET', query, body, headers, signal, keepalive } = {}) {
  let response
  try {
    response = await fetch(`${apiUrl(service, path)}${queryString(query)}`, {
      method,
      credentials: 'same-origin',
      signal,
      keepalive,
      headers: { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : serialize(body),
    })
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new ApiError(0, 'NETWORK_ERROR')
  }

  if (!response.ok) {
    const problem = await response.json().catch(() => null)
    throw new ApiError(response.status, problem?.code, {
      fieldErrors: problem?.errors,
      retryAfter: Number(response.headers.get('Retry-After')) || undefined,
    })
  }
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

/** Codes qui disent que la session est finie : aucun nouvel essai ne servira. */
const SESSION_OVER = ['SESSION_EXPIRED', 'ACCOUNT_DISABLED']

const isSessionOver = (error) => error instanceof ApiError && SESSION_OVER.includes(error.code)

/**
 * Le refresh conserve le profil actif de la session, mais la session est commune à tous les onglets : un autre onglet
 * a pu en choisir un autre. On ré-sélectionne donc le profil retenu par cet onglet. Un profil introuvable (supprimé,
 * ou d'un autre compte) est oublié. Une panne de la sélection ne fait pas perdre la session ; une session finie ou un
 * compte désactivé, si.
 * @param {string} token Jeton fraîchement obtenu.
 * @returns {Promise<string>} Le jeton portant le profil de cet onglet, ou `token` si la sélection échoue.
 * @throws {ApiError} `SESSION_EXPIRED` ou `ACCOUNT_DISABLED`.
 */
async function restoreActiveProfile(token) {
  const profileId = rememberedProfile()
  if (!profileId) return token
  try {
    const selected = await request('identity', `/v1/profiles/${encodeURIComponent(profileId)}/select`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    return selected.accessToken
  } catch (error) {
    if (isSessionOver(error)) throw error
    if (error instanceof ApiError && error.status === 404) forgetProfile()
    return token
  }
}

/**
 * Exécute `task` sous un verrou commun à tous les onglets (Web Locks), pour qu'un seul refresh parte à la fois,
 * avec le cookie posé par le précédent. Sans cette API (contexte non sécurisé), `task` s'exécute directement.
 */
const withRefreshLock = (task) =>
  navigator.locks ? navigator.locks.request('homeflix:refresh', task) : task()

/**
 * Échange le cookie de rafraîchissement contre un nouveau jeton. `keepalive` : si la page est quittée pendant
 * l'appel (rechargement), la requête aboutit quand même et le navigateur reçoit le nouveau cookie.
 */
const rotateRefreshToken = () =>
  withRefreshLock(() =>
    request('identity', '/v1/auth/refresh', { method: 'POST', headers: SESSION_HEADER, keepalive: true }),
  )

/**
 * Renouvelle l'access token via le cookie de rafraîchissement, puis rétablit le profil actif retenu.
 * Le refresh token est à usage unique et le réutiliser révoque la session : les appels concurrents partagent la
 * même requête (ex. React StrictMode en développement) et les onglets passent l'un après l'autre.
 * @returns {Promise<string>} Le nouvel access token.
 */
export function refreshAccessToken() {
  refreshing ??= (async () => {
    try {
      const token = await rotateRefreshToken()
      accessToken = await restoreActiveProfile(token.accessToken)
      return accessToken
    } catch (error) {
      accessToken = null
      throw error
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

// Un 401 d'identifiants incorrects ou de ticket de streaming n'est pas un jeton expiré.
const NOT_A_TOKEN_PROBLEM = ['AUTH_INVALID_CREDENTIALS', 'TICKET_EXPIRED']

const shouldRefresh = (error) =>
  error instanceof ApiError && error.status === 401 && !NOT_A_TOKEN_PROBLEM.includes(error.code)

/** Abandonne la session et prévient l'application ; `cause` distingue un compte désactivé d'une session expirée. */
function sessionLost(cause) {
  const disabled = cause?.code === 'ACCOUNT_DISABLED'
  const code = disabled ? 'ACCOUNT_DISABLED' : 'SESSION_EXPIRED'
  accessToken = null
  forgetProfile()
  sessionExpiredHandler(code)
  return new ApiError(disabled ? 403 : 401, code)
}

const isAccountDisabled = (error) => error instanceof ApiError && error.code === 'ACCOUNT_DISABLED'

/**
 * Appel d'API : ajoute le jeton, convertit les erreurs en `ApiError` (message français), et sur un
 * 401 tente un refresh puis rejoue la requête UNE fois. Si la session est perdue ou le compte désactivé, appelle le
 * handler de `onSessionExpired` et lève `SESSION_EXPIRED` ou `ACCOUNT_DISABLED`.
 *
 * @param {'identity'|'library'|'acquisition'} service
 * @param {string} path Chemin après le service, ex. `/v1/media`.
 * @param {object} [options]
 * @param {string} [options.method] `GET` par défaut.
 * @param {object} [options.query] Paramètres d'URL ; les valeurs vides sont ignorées.
 * @param {*} [options.body] Objet sérialisé en JSON.
 * @param {Record<string,string>} [options.headers]
 * @param {boolean} [options.keepalive] La requête survit à la fermeture de la page (fin de visionnage).
 * @param {AbortSignal} [options.signal] Annulation : la promesse est rejetée avec une AbortError (voir `isAbortError`).
 * @param {boolean} [options.auth] `false` pour un endpoint anonyme (pas de jeton, pas de refresh).
 * @returns {Promise<*>} Le JSON de la réponse, ou `null` (204).
 * @throws {ApiError}
 */
export async function apiFetch(service, path, { auth = true, headers, ...options } = {}) {
  const send = () =>
    request(service, path, {
      ...options,
      headers: { ...headers, ...(auth && accessToken && { Authorization: `Bearer ${accessToken}` }) },
    })

  try {
    return await send()
  } catch (error) {
    if (auth && isAccountDisabled(error)) throw sessionLost(error)
    if (!auth || !shouldRefresh(error)) throw error
  }

  try {
    await refreshAccessToken()
  } catch (error) {
    // Refresh refusé : session perdue. Une panne réseau ou serveur ne l'est pas : on remonte l'erreur.
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) throw sessionLost(error)
    throw error
  }

  try {
    return await send()
  } catch (error) {
    // Rejeu refusé alors que le jeton vient d'être renouvelé : on s'arrête là (pas de boucle).
    if (shouldRefresh(error) || isAccountDisabled(error)) throw sessionLost(error)
    throw error
  }
}
