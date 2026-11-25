import { forgetProfile, rememberProfile } from '@/services/activeProfile'
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
  forgetProfile() // le profil retenu appartenait peut-être à un autre compte
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
    forgetProfile()
  }
}

/**
 * Supprime son propre compte (`DELETE /accounts/me`) après confirmation du mot de passe : profils, sessions et données
 * associées sont purgés, les fichiers médias ne le sont jamais. Lève une `ApiError` : `AUTH_INVALID_CREDENTIALS`
 * (mauvais mot de passe : la session reste ouverte), `LAST_ADMIN` (409) ou `VALIDATION_ERROR`. En cas de succès, la
 * session locale est abandonnée (le serveur a fermé les sessions avec le compte).
 * @param {string} password
 * @returns {Promise<void>}
 */
export async function deleteOwnAccount(password) {
  await apiFetch('identity', '/v1/accounts/me', { method: 'DELETE', body: { password } })
  setAccessToken(null)
  forgetProfile()
}

/**
 * Choisit le profil actif : le serveur renvoie un nouvel access token portant le claim `pid`. Le profil est
 * retenu pour cet onglet, afin de le rétablir après un rechargement ou un renouvellement du jeton.
 * @param {string} profileId
 * @returns {Promise<void>}
 */
export async function selectProfile(profileId) {
  const token = await apiFetch('identity', `/v1/profiles/${encodeURIComponent(profileId)}/select`, {
    method: 'POST',
  })
  setAccessToken(token.accessToken)
  rememberProfile(profileId)
}
