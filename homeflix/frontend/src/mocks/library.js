import indexJobRunning from '@fixtures/library/index-job-running.json'
import progressNotStarted from '@fixtures/library/progress-not-started.json'
import { http, HttpResponse } from 'msw'
import { nowIso } from '@/mocks/db'
import { authenticate, noContent, paginate, problem, readJson } from '@/mocks/http'

const BASE = '/api/library/v1'
const COMPLETED_RATIO = 0.95
const ALLOWED_BASES = ['/media', '/downloads']

const invalid = (field, message) => problem('validation-error', { errors: [{ field, message }] })

const SORTS = {
  'addedAt,desc': (a, b) => b.addedAt.localeCompare(a.addedAt),
  'title,asc': (a, b) => a.title.localeCompare(b.title, 'fr'),
  'year,desc': (a, b) => b.year - a.year,
}

function progressState(position, duration) {
  if (position <= 0) return 'NOT_STARTED'
  return position >= duration * COMPLETED_RATIO ? 'COMPLETED' : 'STARTED'
}

function checkRoot(db, rawPath) {
  const path = String(rawPath ?? '')
  const refuse = (code, problemName) => ({ valid: false, code, problemName })
  if (!path.startsWith('/') || path.split('/').includes('..') || !ALLOWED_BASES.some((b) => path === b || path.startsWith(`${b}/`))) {
    return refuse('ROOT_NOT_ALLOWED', 'root-not-allowed')
  }
  const overlap = db.roots.find((r) => path.startsWith(r.path) || r.path.startsWith(path))
  if (overlap) return refuse('ROOT_OVERLAP', 'root-overlap')
  return { valid: true }
}

/** Handlers du contrat library.openapi.yaml. */
export function libraryHandlers(db) {
  const findMedia = (id) => db.media.find((m) => m.id === id)
  const progressOf = (profileId, mediaId) => {
    const stored = db.progress.get(profileId)?.get(mediaId)
    if (stored) return stored
    return { ...progressNotStarted, mediaId, durationSeconds: findMedia(mediaId)?.durationSeconds ?? 0 }
  }
  const continueWatching = (profileId) =>
    [...(db.progress.get(profileId)?.values() ?? [])]
      .filter((p) => p.state === 'STARTED' && findMedia(p.mediaId))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((progress) => ({ media: findMedia(progress.mediaId), progress }))
  const favouriteItems = (profileId) =>
    [...(db.favourites.get(profileId) ?? new Map())]
      .filter(([id]) => findMedia(id))
      .map(([id, addedAt]) => ({ ...findMedia(id), addedAt }))

  return [
    http.get(`${BASE}/media`, ({ request }) => {
      const auth = authenticate(db, request)
      if (auth.error) return auth.error
      const url = new URL(request.url)
      const q = url.searchParams.get('q')?.trim().toLowerCase()
      const genre = url.searchParams.get('genre')
      const availability = url.searchParams.get('availability')
      const sort = SORTS[url.searchParams.get('sort')] ?? SORTS['addedAt,desc']
      const items = db.media
        .filter((m) => !q || m.title.toLowerCase().includes(q))
        .filter((m) => !genre || m.genres.includes(genre))
        .filter((m) => !availability || m.availability === availability)
        .sort(sort)
      return HttpResponse.json(paginate(items, url))
    }),

    http.get(`${BASE}/media/:mediaId`, ({ request, params }) => {
      const auth = authenticate(db, request)
      if (auth.error) return auth.error
      const media = findMedia(params.mediaId)
      return media ? HttpResponse.json(media) : problem('not-found')
    }),

    http.get(`${BASE}/genres`, ({ request }) => {
      const auth = authenticate(db, request)
      return auth.error ?? HttpResponse.json(db.genres)
    }),

    http.get(`${BASE}/home`, ({ request }) => {
      const auth = authenticate(db, request, { profile: true })
      if (auth.error) return auth.error
      const available = db.media.filter((m) => m.availability === 'AVAILABLE')
      return HttpResponse.json({
        continueWatching: continueWatching(auth.profileId),
        recentlyAdded: [...available].sort(SORTS['addedAt,desc']).slice(0, 6),
        categories: db.genres
          .map((genre) => ({ genre, items: available.filter((m) => m.genres.includes(genre)) }))
          .filter((category) => category.items.length > 0),
        favourites: favouriteItems(auth.profileId),
      })
    }),

    http.get(`${BASE}/me/continue-watching`, ({ request }) => {
      const auth = authenticate(db, request, { profile: true })
      return auth.error ?? HttpResponse.json(continueWatching(auth.profileId))
    }),

    http.get(`${BASE}/me/favourites`, ({ request }) => {
      const auth = authenticate(db, request, { profile: true })
      return auth.error ?? HttpResponse.json(favouriteItems(auth.profileId))
    }),

    http.put(`${BASE}/me/favourites/:mediaId`, ({ request, params }) => {
      const auth = authenticate(db, request, { profile: true })
      if (auth.error) return auth.error
      if (!findMedia(params.mediaId)) return problem('not-found')
      const list = db.favourites.get(auth.profileId)
      if (!list.has(params.mediaId)) list.set(params.mediaId, nowIso())
      return noContent()
    }),

    http.delete(`${BASE}/me/favourites/:mediaId`, ({ request, params }) => {
      const auth = authenticate(db, request, { profile: true })
      if (auth.error) return auth.error
      db.favourites.get(auth.profileId).delete(params.mediaId)
      return noContent()
    }),

    http.get(`${BASE}/media/:mediaId/progress`, ({ request, params }) => {
      const auth = authenticate(db, request, { profile: true })
      if (auth.error) return auth.error
      if (!findMedia(params.mediaId)) return problem('not-found')
      return HttpResponse.json(progressOf(auth.profileId, params.mediaId))
    }),

    http.put(`${BASE}/media/:mediaId/progress`, async ({ request, params }) => {
      const auth = authenticate(db, request, { profile: true })
      if (auth.error) return auth.error
      if (!findMedia(params.mediaId)) return problem('not-found')
      const { positionSeconds, durationSeconds } = await readJson(request)
      if (!Number.isInteger(positionSeconds) || positionSeconds < 0) {
        return invalid('positionSeconds', 'La position doit être un entier positif ou nul.')
      }
      if (!Number.isInteger(durationSeconds) || durationSeconds < 1) {
        return invalid('durationSeconds', 'La durée doit être un entier supérieur à 0.')
      }
      const progress = {
        mediaId: params.mediaId,
        positionSeconds,
        durationSeconds,
        state: progressState(positionSeconds, durationSeconds),
        updatedAt: nowIso(),
      }
      db.progress.get(auth.profileId).set(params.mediaId, progress)
      return HttpResponse.json(progress)
    }),

    http.delete(`${BASE}/media/:mediaId/progress`, ({ request, params }) => {
      const auth = authenticate(db, request, { profile: true })
      if (auth.error) return auth.error
      db.progress.get(auth.profileId).delete(params.mediaId)
      return noContent()
    }),

    http.post(`${BASE}/media/:mediaId/stream-ticket`, ({ request, params }) => {
      const auth = authenticate(db, request, { profile: true })
      if (auth.error) return auth.error
      const media = findMedia(params.mediaId)
      if (!media) return problem('not-found')
      if (media.availability !== 'AVAILABLE') return problem('media-unavailable')
      return HttpResponse.json({
        url: `/api/library/v1/stream/${media.id}?t=mock-ticket`,
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      })
    }),

    // Le flux vidéo n'est pas simulé : la page de lecture reçoit l'erreur « fichier introuvable ».
    http.get(`${BASE}/stream/:mediaId`, () => problem('media-file-missing')),

    http.get(`${BASE}/admin/media-roots`, ({ request }) => {
      const auth = authenticate(db, request, { admin: true })
      return auth.error ?? HttpResponse.json(db.roots)
    }),

    http.post(`${BASE}/admin/media-roots/validate`, async ({ request }) => {
      const auth = authenticate(db, request, { admin: true })
      if (auth.error) return auth.error
      const { path } = await readJson(request)
      const { valid, code, problemName } = checkRoot(db, path)
      if (valid) return HttpResponse.json({ valid: true })
      const { detail } = await problem(problemName).json()
      return HttpResponse.json({ valid: false, code, message: detail })
    }),

    http.post(`${BASE}/admin/media-roots`, async ({ request }) => {
      const auth = authenticate(db, request, { admin: true })
      if (auth.error) return auth.error
      const { path, label } = await readJson(request)
      if (!path) return invalid('path', 'Indiquez le chemin du dossier.')
      const check = checkRoot(db, path)
      if (!check.valid) return problem(check.problemName)
      const root = {
        id: crypto.randomUUID(),
        path,
        label: label?.trim() || path.split('/').filter(Boolean).pop(),
        enabled: true,
        createdAt: nowIso(),
      }
      db.roots.push(root)
      return HttpResponse.json(root, { status: 201 })
    }),

    http.patch(`${BASE}/admin/media-roots/:rootId`, async ({ request, params }) => {
      const auth = authenticate(db, request, { admin: true })
      if (auth.error) return auth.error
      const root = db.roots.find((r) => r.id === params.rootId)
      if (!root) return problem('root-not-found')
      const { label, enabled } = await readJson(request)
      if (label !== undefined && !label.trim()) return invalid('label', 'Le libellé ne peut pas être vide.')
      if (label !== undefined) root.label = label.trim()
      if (enabled !== undefined) root.enabled = enabled
      return HttpResponse.json(root)
    }),

    http.delete(`${BASE}/admin/media-roots/:rootId`, ({ request, params }) => {
      const auth = authenticate(db, request, { admin: true })
      if (auth.error) return auth.error
      if (!db.roots.some((r) => r.id === params.rootId)) return problem('root-not-found')
      db.roots = db.roots.filter((r) => r.id !== params.rootId)
      return noContent()
    }),

    http.post(`${BASE}/admin/index`, ({ request }) => {
      const auth = authenticate(db, request, { admin: true })
      if (auth.error) return auth.error
      if (db.indexJob?.state === 'RUNNING') return problem('index-already-running')
      db.indexPolls = 0
      db.indexJob = {
        ...indexJobRunning,
        jobId: crypto.randomUUID(),
        state: 'RUNNING',
        scanned: 0,
        added: 0,
        updated: 0,
        duplicates: 0,
        errors: 0,
        startedAt: nowIso(),
        finishedAt: null,
      }
      return HttpResponse.json(db.indexJob, { status: 202 })
    }),

    // Chaque consultation fait avancer l'indexation ; elle se termine à la 4e.
    http.get(`${BASE}/admin/index/status`, ({ request }) => {
      const auth = authenticate(db, request, { admin: true })
      if (auth.error) return auth.error
      if (!db.indexJob) {
        return HttpResponse.json({ jobId: crypto.randomUUID(), state: 'IDLE', startedAt: null, finishedAt: null })
      }
      if (db.indexJob.state === 'RUNNING') {
        db.indexPolls += 1
        db.indexJob.scanned += 14
        db.indexJob.added += 4
        if (db.indexPolls >= 4) {
          db.indexJob.state = 'COMPLETED'
          db.indexJob.finishedAt = nowIso()
        }
      }
      return HttpResponse.json(db.indexJob)
    }),

    http.patch(`${BASE}/admin/media/:mediaId`, async ({ request, params }) => {
      const auth = authenticate(db, request, { admin: true })
      if (auth.error) return auth.error
      const media = findMedia(params.mediaId)
      if (!media) return problem('not-found')
      const { title, description, genres, year } = await readJson(request)
      if (title !== undefined && !title.trim()) return invalid('title', 'Le titre ne peut pas être vide.')
      if (title !== undefined) media.title = title.trim()
      if (description !== undefined) media.description = description
      if (genres !== undefined) media.genres = genres
      if (year !== undefined) media.year = year
      return HttpResponse.json(media)
    }),

    http.delete(`${BASE}/admin/media/:mediaId`, ({ request, params }) => {
      const auth = authenticate(db, request, { admin: true })
      if (auth.error) return auth.error
      if (!findMedia(params.mediaId)) return problem('not-found')
      db.media = db.media.filter((m) => m.id !== params.mediaId)
      return noContent()
    }),
  ]
}
