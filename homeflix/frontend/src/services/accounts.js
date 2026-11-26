import { apiFetch } from '@/services/api'

const accountPath = (accountId) => `/v1/admin/accounts/${encodeURIComponent(accountId)}`

/**
 * Comptes, par page (`GET /admin/accounts`, ADMIN). `page` commence à 0 comme dans le contrat.
 * @param {{page?: number, size?: number}} [query]
 * @param {AbortSignal} [signal]
 * @returns {Promise<{items: object[], page: number, size: number, total: number, totalPages: number}>}
 */
export async function listAccounts(query = {}, signal) {
  const page = await apiFetch('identity', '/v1/admin/accounts', { query, signal })
  if (!Array.isArray(page?.items)) throw new TypeError('Réponse inattendue du serveur pour la liste des comptes.')
  return page
}

/**
 * Crée un compte (`POST /admin/accounts`). Le mot de passe est temporaire : l'utilisateur devra le changer.
 * Lève une `ApiError` : `VALIDATION_ERROR` (champs), `CONFLICT` (identifiant ou e-mail déjà utilisé).
 * @param {{username: string, email: string, password: string, role: 'USER'|'ADMIN'}} account
 */
export const createAccount = (account) => apiFetch('identity', '/v1/admin/accounts', { method: 'POST', body: account })

/**
 * Active ou désactive un compte, ou change son rôle (`PATCH /admin/accounts/{id}`). La désactivation ferme les
 * sessions tout de suite. Le dernier administrateur ne peut être ni désactivé ni rétrogradé (`LAST_ADMIN`).
 * @param {string} accountId
 * @param {{enabled?: boolean, role?: 'USER'|'ADMIN'}} changes
 */
export const updateAccount = (accountId, changes) =>
  apiFetch('identity', accountPath(accountId), { method: 'PATCH', body: changes })

/**
 * Supprime un compte et ses données (`DELETE /admin/accounts/{id}`). Dernier administrateur : `LAST_ADMIN`.
 * @param {string} accountId
 */
export const deleteAccount = (accountId) => apiFetch('identity', accountPath(accountId), { method: 'DELETE' })

/**
 * Définit un mot de passe temporaire (`POST /admin/accounts/{id}/password-reset`) : l'utilisateur devra le changer
 * à sa prochaine connexion.
 * @param {string} accountId
 * @param {string} temporaryPassword 12 à 128 caractères.
 */
export const resetPassword = (accountId, temporaryPassword) =>
  apiFetch('identity', `${accountPath(accountId)}/password-reset`, { method: 'POST', body: { temporaryPassword } })
