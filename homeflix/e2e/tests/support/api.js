import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { request } from '@playwright/test'

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:8080'
export const IDENTITY = '/api/identity/v1'
export const LIBRARY = '/api/library/v1'
export const STATE_FILE = fileURLToPath(new URL('../../.state.json', import.meta.url))

/** Mot de passe aléatoire (12 caractères minimum exigés par Identity), jamais écrit dans un journal. */
export function randomPassword() {
  return randomBytes(12).toString('base64url')
}

export function randomName(prefix) {
  return `${prefix}-${randomBytes(4).toString('hex')}`
}

export function newApi() {
  return request.newContext({ baseURL: BASE_URL })
}

/** Identifiants de l'administrateur de test : variables d'environnement, sinon fichier créé au premier lancement. */
export function adminCredentials() {
  if (process.env.E2E_ADMIN_USERNAME && process.env.E2E_ADMIN_PASSWORD) {
    return { username: process.env.E2E_ADMIN_USERNAME, password: process.env.E2E_ADMIN_PASSWORD }
  }
  if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, 'utf8'))
  return null
}

export function saveAdminCredentials(credentials) {
  writeFileSync(STATE_FILE, JSON.stringify(credentials), { mode: 0o600 })
}

/** Connexion par l'API : renvoie le jeton d'accès (15 minutes). */
export async function login(api, username, password) {
  const response = await api.post(`${IDENTITY}/auth/login`, { data: { username, password } })
  if (!response.ok()) return null
  return (await response.json()).accessToken
}

export function bearer(token) {
  return { Authorization: `Bearer ${token}` }
}

/** Crée un compte USER avec deux profils, Alice et Bob. Renvoie ce qu'il faut pour le supprimer ensuite. */
export async function createUserWithProfiles(api, adminToken) {
  const username = randomName('e2e')
  const password = randomPassword()
  const created = await api.post(`${IDENTITY}/admin/accounts`, {
    headers: bearer(adminToken),
    data: { username, email: `${username}@example.test`, password, role: 'USER' },
  })
  if (created.status() !== 201) throw new Error(`Création du compte de test impossible (HTTP ${created.status()}).`)
  const account = await created.json()
  const userToken = await login(api, username, password)
  for (const [name, avatar] of [['Alice', 'bleu'], ['Bob', 'rouge']]) {
    const profile = await api.post(`${IDENTITY}/profiles`, { headers: bearer(userToken), data: { name, avatar } })
    if (profile.status() !== 201) throw new Error(`Création du profil ${name} impossible (HTTP ${profile.status()}).`)
  }
  return { accountId: account.id, username, password }
}

export async function deleteAccount(api, adminToken, accountId) {
  await api.delete(`${IDENTITY}/admin/accounts/${accountId}`, { headers: bearer(adminToken) })
}
