import accountsPage from '@fixtures/identity/accounts-page.json'
import profilesFixture from '@fixtures/identity/profiles.json'
import continueWatching from '@fixtures/library/continue-watching.json'
import favouritesFixture from '@fixtures/library/favourites.json'
import genres from '@fixtures/library/genres.json'
import mediaPage from '@fixtures/library/media-page.json'
import mediaRoots from '@fixtures/library/media-roots.json'
import progressCompleted from '@fixtures/library/progress-completed.json'

const SESSION_KEY = 'homeflix:mock-session'
const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString()

/** Mot de passe accepté pour tous les comptes de démonstration. */
export const MOCK_PASSWORD = 'mot-de-passe-12'

function readSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY)) ?? null
  } catch {
    return null
  }
}

function writeSession(session) {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // stockage indisponible : la session ne survit simplement pas au rechargement
  }
}

const entry = (title, overrides) => ({
  id: crypto.randomUUID(),
  title,
  source: 'Blender Foundation',
  license: 'CC BY 3.0',
  licenseProofUrl: 'https://studio.blender.org/films/',
  sizeBytes: 350_000_000,
  inLibrary: false,
  libraryMediaId: null,
  activeDownloadId: null,
  ...overrides,
})

/**
 * État en mémoire des mocks, initialisé depuis les fixtures du contrat (docs/api/fixtures).
 * Les écritures (profils, favoris, progression, dossiers, téléchargements…) y persistent jusqu'au
 * rechargement de la page ; seule la session survit (sessionStorage).
 */
export function createDb() {
  const media = structuredClone(mediaPage.items)
  const profiles = structuredClone(profilesFixture)
  const [firstProfile] = profiles

  const favourites = new Map(profiles.map((p) => [p.id, new Map()]))
  for (const item of favouritesFixture) favourites.get(firstProfile.id).set(item.id, item.addedAt)

  const progress = new Map(profiles.map((p) => [p.id, new Map()]))
  for (const { progress: p } of continueWatching) progress.get(firstProfile.id).set(p.mediaId, p)
  progress.get(firstProfile.id).set(progressCompleted.mediaId, structuredClone(progressCompleted))

  const bigBuckBunny = media.find((m) => m.title === 'Big Buck Bunny')
  const sintel = entry('Sintel (version 4K)', { sizeBytes: 900_000_000 })
  const downloads = [
    {
      id: crypto.randomUUID(),
      catalogueEntryId: sintel.id,
      title: sintel.title,
      state: 'DOWNLOADING',
      progressPercent: 40,
      errorCode: null,
      errorMessage: null,
      libraryMediaId: null,
      createdAt: minutesAgo(12),
      finishedAt: null,
    },
  ]
  sintel.activeDownloadId = downloads[0].id

  return {
    media,
    genres: structuredClone(genres),
    roots: structuredClone(mediaRoots),
    indexJob: null,
    indexPolls: 0,
    accounts: structuredClone(accountsPage.items),
    // Simplification : tous les comptes de démonstration partagent la même liste de profils.
    profiles,
    favourites,
    progress,
    session: readSession(),
    // État des services relevé par `GET /admin/system/status` (`UP` par défaut).
    services: { identity: 'UP', library: 'UP', acquisition: 'UP' },
    acquisition: {
      rightsAcknowledged: false,
      noticeVersion: '2026-11',
      catalogue: [
        entry('Big Buck Bunny', {
          inLibrary: true,
          libraryMediaId: bigBuckBunny?.id ?? null,
        }),
        sintel,
        entry('Sprite Fright', { sizeBytes: 600_000_000 }),
        entry('Wing It!', { sizeBytes: 250_000_000 }),
        entry('Caminandes : Gran Dillama', { sizeBytes: 120_000_000 }),
      ],
      downloads,
    },
  }
}

export const setSession = (db, session) => {
  db.session = session
  writeSession(session)
}

export const nowIso = () => new Date().toISOString()
