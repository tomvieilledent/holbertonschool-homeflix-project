import { http, HttpResponse } from 'msw'
import { nowIso } from '@/mocks/db'
import { authenticate, paginate, problem, readJson } from '@/mocks/http'

const BASE = '/api/acquisition/v1'
const PROGRESS_STEP = 25
const TERMINAL = ['COMPLETED', 'FAILED', 'CANCELLED']

const NOTICE_TEXT =
  'Ne téléchargez que des contenus libres de droits ou dont vous détenez les droits. ' +
  'HomeFlix ne propose que des sources autorisées et vous êtes responsable de l’usage que vous en faites.'

const invalid = (field, message) => problem('validation-error', { errors: [{ field, message }] })

/** Handlers du contrat acquisition.openapi.yaml (aucune fixture JSON n'existe encore pour ce service). */
export function acquisitionHandlers(db) {
  const state = db.acquisition
  const notice = () => ({
    version: state.noticeVersion,
    text: NOTICE_TEXT,
    acknowledged: state.rightsAcknowledged,
    acknowledgedAt: state.rightsAcknowledged ? state.acknowledgedAt : null,
  })

  // Chaque consultation fait avancer un téléchargement actif, pour pouvoir tester le suivi.
  const advance = (download) => {
    if (TERMINAL.includes(download.state)) return
    download.state = 'DOWNLOADING'
    download.progressPercent = Math.min(100, download.progressPercent + PROGRESS_STEP)
    if (download.progressPercent === 100) {
      download.state = 'COMPLETED'
      download.finishedAt = nowIso()
      const entry = state.catalogue.find((e) => e.id === download.catalogueEntryId)
      download.libraryMediaId = crypto.randomUUID()
      if (entry) Object.assign(entry, { inLibrary: true, libraryMediaId: download.libraryMediaId, activeDownloadId: null })
    }
  }

  return [
    http.get(`${BASE}/catalogue`, ({ request }) => {
      const auth = authenticate(db, request, { admin: true })
      return auth.error ?? HttpResponse.json(paginate(state.catalogue, new URL(request.url)))
    }),

    http.get(`${BASE}/rights-notice`, ({ request }) => {
      const auth = authenticate(db, request, { admin: true })
      return auth.error ?? HttpResponse.json(notice())
    }),

    http.post(`${BASE}/rights-notice/ack`, async ({ request }) => {
      const auth = authenticate(db, request, { admin: true })
      if (auth.error) return auth.error
      const { noticeVersion } = await readJson(request)
      if (!noticeVersion) return invalid('noticeVersion', 'La version du rappel est obligatoire.')
      if (noticeVersion !== state.noticeVersion) return problem('conflict')
      if (!state.rightsAcknowledged) {
        state.rightsAcknowledged = true
        state.acknowledgedAt = nowIso()
      }
      return HttpResponse.json(notice())
    }),

    http.post(`${BASE}/downloads`, async ({ request }) => {
      const auth = authenticate(db, request, { admin: true })
      if (auth.error) return auth.error
      const { catalogueEntryId } = await readJson(request)
      if (!catalogueEntryId) return invalid('catalogueEntryId', 'Choisissez une entrée du catalogue.')
      const entry = state.catalogue.find((e) => e.id === catalogueEntryId)
      if (!entry) return problem('not-found')
      if (!state.rightsAcknowledged) return problem('rights-not-acknowledged')
      if (entry.activeDownloadId) return problem('download-already-active')
      if (entry.inLibrary) return problem('conflict')
      const download = {
        id: crypto.randomUUID(),
        catalogueEntryId: entry.id,
        title: entry.title,
        state: 'QUEUED',
        progressPercent: 0,
        errorCode: null,
        errorMessage: null,
        libraryMediaId: null,
        createdAt: nowIso(),
        finishedAt: null,
      }
      state.downloads.unshift(download)
      entry.activeDownloadId = download.id
      return HttpResponse.json(download, {
        status: 202,
        headers: { Location: `${BASE}/downloads/${download.id}` },
      })
    }),

    http.get(`${BASE}/downloads`, ({ request }) => {
      const auth = authenticate(db, request, { admin: true })
      if (auth.error) return auth.error
      const url = new URL(request.url)
      const wanted = url.searchParams.get('state')
      state.downloads.forEach(advance)
      const items = state.downloads.filter((d) => !wanted || d.state === wanted)
      return HttpResponse.json(paginate(items, url))
    }),

    http.get(`${BASE}/downloads/:downloadId`, ({ request, params }) => {
      const auth = authenticate(db, request, { admin: true })
      if (auth.error) return auth.error
      const download = state.downloads.find((d) => d.id === params.downloadId)
      if (!download) return problem('not-found')
      advance(download)
      return HttpResponse.json(download)
    }),

    http.post(`${BASE}/downloads/:downloadId/cancel`, ({ request, params }) => {
      const auth = authenticate(db, request, { admin: true })
      if (auth.error) return auth.error
      const download = state.downloads.find((d) => d.id === params.downloadId)
      if (!download) return problem('not-found')
      if (download.state === 'CANCELLED') return HttpResponse.json(download) // idempotent (contrat)
      if (TERMINAL.includes(download.state)) return problem('conflict') // COMPLETED ou FAILED
      download.state = 'CANCELLED'
      download.finishedAt = nowIso()
      const entry = state.catalogue.find((e) => e.id === download.catalogueEntryId)
      if (entry) entry.activeDownloadId = null
      return HttpResponse.json(download)
    }),
  ]
}
