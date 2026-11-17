import { config } from '@/app/config'

/** Construit une URL relative : /api/<service>/v1/... (nginx en prod, proxy Vite en dev). */
export const apiUrl = (service, path) =>
  `${config.apiBase}/${service}${path.startsWith('/') ? path : `/${path}`}`

/** Erreur HTTP de l'API : `status` et `code` (code stable du problem+json, s'il est présent). */
export class ApiError extends Error {
  constructor(status, code) {
    super(`HTTP ${status}`)
    this.status = status
    this.code = code
  }
}

export async function apiFetch(service, path, options = {}) {
  const response = await fetch(apiUrl(service, path), {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  if (!response.ok) {
    const problem = await response.json().catch(() => null)
    throw new ApiError(response.status, problem?.code)
  }
  return response.status === 204 ? null : response.json()
}
