import { apiFetch } from '@/services/api'

/** `true` tant qu'aucun administrateur n'existe (endpoint anonyme). */
export async function fetchSetupRequired(signal) {
  const status = await apiFetch('identity', '/v1/setup/status', { auth: false, signal })
  return status.setupRequired
}

/**
 * Crée le premier administrateur. Lève une `ApiError` (`SETUP_TOKEN_INVALID`, `SETUP_ALREADY_DONE`,
 * `VALIDATION_ERROR` avec `fieldErrors`) dont le `message` est affichable tel quel.
 */
export const createFirstAdmin = ({ setupToken, username, email, password }) =>
  apiFetch('identity', '/v1/setup', {
    method: 'POST',
    auth: false,
    body: { setupToken, username, email, password },
  })
