import { apiFetch } from '@/services/api'

/**
 * Profils du compte connecté.
 * @param {AbortSignal} [signal]
 * @returns {Promise<{id: string, name: string, avatar: string, createdAt: string}[]>}
 */
export const listProfiles = (signal) => apiFetch('identity', '/v1/profiles', { signal })

/** Nombre maximal de profils par compte (contrat Identity). */
export const MAX_PROFILES = 5

// L'avatar est un identifiant prédéfini obligatoire à la création ; l'interface n'en propose pas encore le choix.
const DEFAULT_AVATAR = 'avatar-1'

/**
 * Crée un profil (`POST /profiles`). Lève une `ApiError` : `VALIDATION_ERROR` (nom invalide),
 * `PROFILE_LIMIT_REACHED` (5 profils), `CONFLICT` (nom déjà utilisé dans le compte).
 * @param {string} name 1 à 30 caractères.
 * @returns {Promise<{id: string, name: string, avatar: string, createdAt: string}>}
 */
export const createProfile = (name) =>
  apiFetch('identity', '/v1/profiles', { method: 'POST', body: { name, avatar: DEFAULT_AVATAR } })

/**
 * Renomme un profil (`PATCH /profiles/{id}`). Mêmes erreurs de nom que `createProfile`.
 * @param {string} profileId
 * @param {string} name
 */
export const renameProfile = (profileId, name) =>
  apiFetch('identity', `/v1/profiles/${encodeURIComponent(profileId)}`, { method: 'PATCH', body: { name } })

/**
 * Supprime un profil avec ses favoris et sa progression (`DELETE /profiles/{id}`).
 * Le dernier profil d'un compte ne peut pas être supprimé (`CONFLICT`).
 * @param {string} profileId
 */
export const deleteProfile = (profileId) =>
  apiFetch('identity', `/v1/profiles/${encodeURIComponent(profileId)}`, { method: 'DELETE' })
