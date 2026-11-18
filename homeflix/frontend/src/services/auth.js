import { apiFetch } from '@/services/api'

// Le cookie refresh_token est exigé avec cet en-tête (voir identity.openapi.yaml).
const SESSION_HEADER = { 'X-Requested-With': 'homeflix' }

// L'access token reste en mémoire : jamais dans localStorage ni dans un cookie lisible par le JS.
let accessToken = null
let restoring = null

export const getAccessToken = () => accessToken

const loadMe = () =>
  apiFetch('identity', '/v1/auth/me', { headers: { Authorization: `Bearer ${accessToken}` } })

/**
 * Rouvre la session à partir du cookie de rafraîchissement.
 * Les appels concurrents partagent la même requête : le refresh token est à usage unique, et
 * deux appels simultanés (ex. React StrictMode en développement) révoqueraient la session.
 * @returns {Promise<{account: object, activeProfileId?: string}|null>} `null` si pas de session.
 */
export function restoreSession() {
  restoring ??= (async () => {
    try {
      const token = await apiFetch('identity', '/v1/auth/refresh', {
        method: 'POST',
        headers: SESSION_HEADER,
      })
      accessToken = token.accessToken
      return await loadMe()
    } catch {
      accessToken = null
      return null
    } finally {
      restoring = null
    }
  })()
  return restoring
}

/**
 * Connexion. Lève une `ApiError` (`AUTH_INVALID_CREDENTIALS`, `ACCOUNT_DISABLED`, `RATE_LIMITED`…).
 * @returns {Promise<{account: object, activeProfileId?: string}>}
 */
export async function signIn(username, password) {
  const token = await apiFetch('identity', '/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  accessToken = token.accessToken
  return loadMe()
}

/** Déconnexion (idempotente) : la session locale est effacée même si le serveur est injoignable. */
export async function signOut() {
  try {
    await apiFetch('identity', '/v1/auth/logout', { method: 'POST', headers: SESSION_HEADER })
  } catch {
    // le jeton local est de toute façon abandonné
  } finally {
    accessToken = null
  }
}
