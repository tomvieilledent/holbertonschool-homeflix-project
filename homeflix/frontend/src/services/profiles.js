import { apiFetch } from '@/services/api'

/**
 * Profils du compte connecté.
 * @param {AbortSignal} [signal]
 * @returns {Promise<{id: string, name: string, avatar: string, createdAt: string}[]>}
 */
export const listProfiles = (signal) => apiFetch('identity', '/v1/profiles', { signal })
