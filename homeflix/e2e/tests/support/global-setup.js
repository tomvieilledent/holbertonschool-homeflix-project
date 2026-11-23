import {
  IDENTITY, LIBRARY, adminCredentials, bearer, login, newApi, randomPassword, saveAdminCredentials,
} from './api.js'

const FILMS_HINT = 'Placez des films dans demo-media (./scripts/fetch-demo-media.sh) puis relancez la pile.'

async function ensureAdmin(api) {
  const status = await (await api.get(`${IDENTITY}/setup/status`)).json()
  let credentials = adminCredentials()
  if (status.setupRequired) {
    const setupToken = process.env.E2E_SETUP_TOKEN
    if (!setupToken) {
      throw new Error('Pile neuve : fournissez E2E_SETUP_TOKEN (la valeur de SETUP_TOKEN dans homeflix/.env).')
    }
    credentials = { username: 'e2e-admin', password: randomPassword() }
    const created = await api.post(`${IDENTITY}/setup`, {
      data: { setupToken, username: credentials.username, email: 'e2e-admin@example.test', password: credentials.password },
    })
    if (created.status() !== 201) throw new Error(`Création de l'administrateur impossible (HTTP ${created.status()}).`)
    saveAdminCredentials(credentials)
  }
  if (!credentials) {
    throw new Error('Pile déjà initialisée : fournissez E2E_ADMIN_USERNAME et E2E_ADMIN_PASSWORD.')
  }
  const token = await login(api, credentials.username, credentials.password)
  if (!token) throw new Error('Connexion de l\'administrateur de test refusée : identifiants incorrects pour cette pile.')
  return token
}

/** Déclare /media puis lance l'indexation si le catalogue ne contient pas encore de film. */
async function ensureCatalogue(api, token) {
  const headers = bearer(token)
  const roots = await (await api.get(`${LIBRARY}/admin/media-roots`, { headers })).json()
  if (!roots.some((root) => root.path === '/media')) {
    const added = await api.post(`${LIBRARY}/admin/media-roots`, { headers, data: { path: '/media', label: 'Films' } })
    if (added.status() !== 201) throw new Error(`Déclaration de /media impossible (HTTP ${added.status()}). ${FILMS_HINT}`)
  }
  await api.post(`${LIBRARY}/admin/index`, { headers })   // 409 si un scan est déjà en cours : sans importance
  for (let attempt = 0; attempt < 60; attempt++) {
    const job = await (await api.get(`${LIBRARY}/admin/index/status`, { headers })).json()
    if (job.state !== 'RUNNING') break
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  const page = await (await api.get(`${LIBRARY}/media?q=sintel`, { headers })).json()
  if (!page.items?.length) throw new Error(`Le film de démonstration « Sintel » est introuvable. ${FILMS_HINT}`)
}

export default async function globalSetup() {
  const api = await newApi()
  try {
    const token = await ensureAdmin(api)
    await ensureCatalogue(api, token)
  } finally {
    await api.dispose()
  }
}
