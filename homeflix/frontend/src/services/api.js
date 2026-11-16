import { config } from '@/app/config'

/** Construit une URL relative : /api/<service>/v1/... (nginx en prod, proxy Vite en dev). */
export const apiUrl = (service, path) =>
  `${config.apiBase}/${service}${path.startsWith('/') ? path : `/${path}`}`

export async function apiFetch(service, path, options = {}) {
  const response = await fetch(apiUrl(service, path), {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return response.status === 204 ? null : response.json()
}
