import { apiFetch } from '@/services/api'

/**
 * État des services (`GET /admin/system/status`, ADMIN). Identity interroge lui-même Library et Acquisition en
 * parallèle (délai de 2 s chacun) : chaque service est `UP` ou `DOWN`, et l'ensemble est `UP` ou `DEGRADED` (jamais
 * `DOWN` : si Identity ne répond pas, c'est cette requête qui échoue). La réponse ne contient aucun détail technique.
 * @param {AbortSignal} [signal]
 * @returns {Promise<{status: 'UP'|'DEGRADED', checkedAt: string, services: {name: 'identity'|'library'|'acquisition', status: 'UP'|'DOWN'}[]}>}
 */
export async function getSystemStatus(signal) {
  const result = await apiFetch('identity', '/v1/admin/system/status', { signal })
  if (!Array.isArray(result?.services)) throw new TypeError('Réponse inattendue du serveur pour l’état des services.')
  return result
}
