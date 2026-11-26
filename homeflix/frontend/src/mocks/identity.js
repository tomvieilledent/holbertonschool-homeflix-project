import tokenResponse from '@fixtures/identity/token-response.json'
import { http, HttpResponse } from 'msw'
import { MOCK_PASSWORD, nowIso, setSession } from '@/mocks/db'
import { authenticate, noContent, paginate, problem, readJson } from '@/mocks/http'

const BASE = '/api/identity/v1'
const MAX_PROFILES = 5
const MAX_NAME_LENGTH = 30

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase()

const invalid = (field, message) =>
  problem('validation-error', { errors: [{ field, message }] })

const lastAdmin = (db, account) =>
  account.role === 'ADMIN' && db.accounts.filter((a) => a.role === 'ADMIN' && a.enabled).length <= 1

/** Handlers du contrat identity.openapi.yaml. */
export function identityHandlers(db) {
  return [
    http.get(`${BASE}/setup/status`, () => HttpResponse.json({ setupRequired: false })),
    http.post(`${BASE}/setup`, () => problem('setup-already-done')),

    http.post(`${BASE}/auth/login`, async ({ request }) => {
      const { username, password } = await readJson(request)
      const account = db.accounts.find((a) => a.username === username)
      if (!account || password !== MOCK_PASSWORD) return problem('auth-invalid-credentials')
      if (!account.enabled) return problem('account-disabled')
      setSession(db, { accountId: account.id, activeProfileId: null })
      return HttpResponse.json(tokenResponse)
    }),

    http.post(`${BASE}/auth/refresh`, ({ request }) => {
      if (request.headers.get('X-Requested-With') !== 'homeflix') return problem('access-denied')
      if (!db.session) return problem('session-expired')
      return HttpResponse.json(tokenResponse)
    }),

    http.post(`${BASE}/auth/logout`, () => {
      setSession(db, null)
      return noContent()
    }),

    http.get(`${BASE}/auth/me`, ({ request }) => {
      const auth = authenticate(db, request)
      if (auth.error) return auth.error
      return HttpResponse.json({ account: auth.account, activeProfileId: auth.profileId ?? null })
    }),

    http.get(`${BASE}/profiles`, ({ request }) => {
      const auth = authenticate(db, request)
      return auth.error ?? HttpResponse.json(db.profiles)
    }),

    http.post(`${BASE}/profiles`, async ({ request }) => {
      const auth = authenticate(db, request)
      if (auth.error) return auth.error
      const { name, avatar } = await readJson(request)
      if (!name?.trim()) return invalid('name', 'Le nom du profil est obligatoire.')
      if (name.trim().length > MAX_NAME_LENGTH) return invalid('name', 'Au plus 30 caractères.')
      if (db.profiles.length >= MAX_PROFILES) return problem('profile-limit-reached')
      if (db.profiles.some((p) => sameName(p.name, name))) return problem('conflict')
      const profile = {
        id: crypto.randomUUID(),
        name: name.trim(),
        avatar: avatar ?? 'avatar-1',
        createdAt: nowIso(),
      }
      db.profiles.push(profile)
      db.favourites.set(profile.id, new Map())
      db.progress.set(profile.id, new Map())
      return HttpResponse.json(profile, { status: 201 })
    }),

    http.patch(`${BASE}/profiles/:profileId`, async ({ request, params }) => {
      const auth = authenticate(db, request)
      if (auth.error) return auth.error
      const profile = db.profiles.find((p) => p.id === params.profileId)
      if (!profile) return problem('not-found')
      const { name, avatar } = await readJson(request)
      if (name !== undefined && !name.trim()) return invalid('name', 'Le nom du profil est obligatoire.')
      if (name !== undefined && name.trim().length > MAX_NAME_LENGTH) return invalid('name', 'Au plus 30 caractères.')
      if (name !== undefined && db.profiles.some((p) => p !== profile && sameName(p.name, name))) {
        return problem('conflict')
      }
      if (name !== undefined) profile.name = name.trim()
      if (avatar !== undefined) profile.avatar = avatar
      return HttpResponse.json(profile)
    }),

    http.delete(`${BASE}/profiles/:profileId`, ({ request, params }) => {
      const auth = authenticate(db, request)
      if (auth.error) return auth.error
      const index = db.profiles.findIndex((p) => p.id === params.profileId)
      if (index < 0) return problem('not-found')
      if (db.profiles.length === 1) return problem('conflict') // le dernier profil d'un compte est conservé
      db.profiles.splice(index, 1)
      db.favourites.delete(params.profileId)
      db.progress.delete(params.profileId)
      if (db.session.activeProfileId === params.profileId) {
        setSession(db, { ...db.session, activeProfileId: null })
      }
      return noContent()
    }),

    http.post(`${BASE}/profiles/:profileId/select`, ({ request, params }) => {
      const auth = authenticate(db, request)
      if (auth.error) return auth.error
      if (!db.profiles.some((p) => p.id === params.profileId)) return problem('not-found')
      setSession(db, { ...db.session, activeProfileId: params.profileId })
      return HttpResponse.json(tokenResponse)
    }),

    http.delete(`${BASE}/accounts/me`, async ({ request }) => {
      const auth = authenticate(db, request)
      if (auth.error) return auth.error
      const { password } = await readJson(request)
      if (password !== MOCK_PASSWORD) return problem('auth-invalid-credentials')
      if (lastAdmin(db, auth.account)) return problem('last-admin')
      db.accounts = db.accounts.filter((a) => a.id !== auth.account.id)
      setSession(db, null)
      return noContent()
    }),

    http.get(`${BASE}/admin/accounts`, ({ request }) => {
      const auth = authenticate(db, request, { admin: true })
      return auth.error ?? HttpResponse.json(paginate(db.accounts, new URL(request.url)))
    }),

    http.post(`${BASE}/admin/accounts`, async ({ request }) => {
      const auth = authenticate(db, request, { admin: true })
      if (auth.error) return auth.error
      const { username, email, password, role } = await readJson(request)
      if (!username || username.length < 3) return invalid('username', 'Au moins 3 caractères.')
      if (!email?.includes('@')) return invalid('email', 'Adresse e-mail invalide.')
      if (!password || password.length < 12) return invalid('password', 'Au moins 12 caractères.')
      if (!['USER', 'ADMIN'].includes(role)) return invalid('role', 'Rôle invalide.')
      if (db.accounts.some((a) => sameName(a.username, username) || sameName(a.email, email))) {
        return problem('conflict') // identifiant ou e-mail déjà utilisé (contrat)
      }
      const account = {
        id: crypto.randomUUID(),
        username,
        email,
        role,
        enabled: true,
        mustChangePassword: false, // comme le vrai service : seule une réinitialisation l'active
        createdAt: nowIso(),
      }
      db.accounts.push(account)
      return HttpResponse.json(account, { status: 201 })
    }),

    http.get(`${BASE}/admin/accounts/:accountId`, ({ request, params }) => {
      const auth = authenticate(db, request, { admin: true })
      if (auth.error) return auth.error
      const account = db.accounts.find((a) => a.id === params.accountId)
      return account ? HttpResponse.json(account) : problem('not-found')
    }),

    http.patch(`${BASE}/admin/accounts/:accountId`, async ({ request, params }) => {
      const auth = authenticate(db, request, { admin: true })
      if (auth.error) return auth.error
      const account = db.accounts.find((a) => a.id === params.accountId)
      if (!account) return problem('not-found')
      const { enabled, role } = await readJson(request)
      if (role !== undefined && !['USER', 'ADMIN'].includes(role)) return invalid('role', 'Rôle invalide.')
      const demotes = role === 'USER' || enabled === false
      if (demotes && lastAdmin(db, account)) return problem('last-admin')
      if (enabled !== undefined) account.enabled = enabled
      if (role !== undefined) account.role = role
      return HttpResponse.json(account)
    }),

    http.delete(`${BASE}/admin/accounts/:accountId`, ({ request, params }) => {
      const auth = authenticate(db, request, { admin: true })
      if (auth.error) return auth.error
      const account = db.accounts.find((a) => a.id === params.accountId)
      if (!account) return problem('not-found')
      if (lastAdmin(db, account)) return problem('last-admin')
      db.accounts = db.accounts.filter((a) => a.id !== account.id)
      return noContent()
    }),

    http.post(`${BASE}/admin/accounts/:accountId/password-reset`, async ({ request, params }) => {
      const auth = authenticate(db, request, { admin: true })
      if (auth.error) return auth.error
      const account = db.accounts.find((a) => a.id === params.accountId)
      if (!account) return problem('not-found')
      const { temporaryPassword } = await readJson(request)
      if (!temporaryPassword || temporaryPassword.length < 12) {
        return invalid('temporaryPassword', 'Au moins 12 caractères.')
      }
      account.mustChangePassword = true
      return noContent()
    }),

    http.get(`${BASE}/admin/system/status`, ({ request }) => {
      const auth = authenticate(db, request, { admin: true })
      if (auth.error) return auth.error
      const services = ['identity', 'library', 'acquisition'].map((name) => ({ name, status: db.services[name] ?? 'UP' }))
      return HttpResponse.json({
        status: services.every((service) => service.status === 'UP') ? 'UP' : 'DEGRADED',
        checkedAt: nowIso(),
        services,
      })
    }),
  ]
}
