import { apiFetch, refreshAccessToken, SESSION_HEADER, setAccessToken } from '@/services/api'

export { getAccessToken } from '@/services/api'

let restoring = null

const loadMe = () => apiFetch('identity', '/v1/auth/me')

/**
 * Rouvre la session à partir du cookie de rafraîchissement.
 * Les appels concurrents partagent la même requête (React StrictMode en développement).
 * @returns {Promise<{account: object, activeProfileId?: string}|null>} `null` si pas de session.
 */
export function restoreSession() {
  restoring ??= (async () => {
    try {
      await refreshAccessToken()
      return await loadMe()
    } catch {
      setAccessToken(null)
      return null
    } finally {
      restoring = null
    }
  })()
  return restoring
}

/**
 * Connexion. Lève une `ApiError` (`AUTH_INVALID_CREDENTIALS`, `ACCOUNT_DISABLED`, `RATE_LIMITED`…)
 * dont le `message` est affichable tel quel.
 * @returns {Promise<{account: object, activeProfileId?: string}>}
 */
export async function signIn(username, password) {
  const token = await apiFetch('identity', '/v1/auth/login', {
    method: 'POST',
    auth: false,
    body: { username, password },
  })
  setAccessToken(token.accessToken)
  return loadMe()
}

/** Déconnexion (idempotente) : la session locale est effacée même si le serveur est injoignable. */
export async function signOut() {
  try {
    await apiFetch('identity', '/v1/auth/logout', { method: 'POST', auth: false, headers: SESSION_HEADER })
  } catch {
    // le jeton local est de toute façon abandonné
  } finally {
    setAccessToken(null)
  }
}
