import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AcquisitionPage, { DOWNLOADS_MAX_FAILURES, DOWNLOADS_POLL_MS } from '@/features/admin/AcquisitionPage'

// Suivi automatique des téléchargements dans la page d'acquisition : intervalle, arrêt quand plus rien n'est actif,
// redémarrage au lancement d'un téléchargement, annulation. Horloge simulée.

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const problem = (status, code) => json({ status, code }, status) // pour le refus d'annulation (409)

const entry = (id, title, overrides = {}) => ({
  id,
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

const download = (id, title, state, progressPercent = 0, overrides = {}) => ({
  id,
  catalogueEntryId: `e-${id}`,
  title,
  state,
  progressPercent,
  errorCode: null,
  libraryMediaId: null,
  createdAt: '2026-11-23T10:00:00Z',
  finishedAt: null,
  ...overrides,
})

let entries
let rights
let list // téléchargements renvoyés par `GET /downloads` ; une fonction (appel n°) → liste fait évoluer la progression
let calls
let cancelResponse
let listFailure // erreur à lever à la lecture des téléchargements

const downloadReads = () => calls.filter((call) => call === 'GET /downloads').length

function serve() {
  return async (url, init = {}) => {
    const path = String(url).replace('/api/acquisition/v1', '').split('?')[0]
    const method = init.method ?? 'GET'
    calls.push(`${method} ${path}`)
    if (method === 'GET' && path === '/downloads') {
      if (listFailure) throw listFailure
      const items = typeof list === 'function' ? list(downloadReads()) : list
      return json({ items, page: 0, size: 50, total: items.length, totalPages: 1 })
    }
    if (method === 'GET' && path === '/catalogue') return json({ items: entries, page: 0, size: 20, total: entries.length, totalPages: 1 })
    if (method === 'GET' && path === '/rights-notice') return json(rights)
    if (method === 'POST' && path === '/downloads') {
      const created = download('d-new', 'Nouveau', 'QUEUED')
      list = [created, ...(typeof list === 'function' ? list(downloadReads()) : list)]
      return json(created, 202)
    }
    if (method === 'POST' && path.endsWith('/cancel')) return cancelResponse()
    throw new Error(`requête inattendue : ${method} ${path}`)
  }
}

const advance = (ms) => act(async () => vi.advanceTimersByTimeAsync(ms))

describe('suivi des téléchargements', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    entries = [entry('e1', 'Sintel')]
    rights = { version: '2026-11', text: 'Rappel.', acknowledged: true }
    list = []
    calls = []
    listFailure = null
    cancelResponse = () => json(download('d1', 'Sintel', 'CANCELLED', 40))
    vi.stubGlobal('fetch', vi.fn(serve()))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const renderPage = async () => {
    const actor = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const router = createMemoryRouter([{ path: '/admin/acquisition', element: <AcquisitionPage /> }], { initialEntries: ['/admin/acquisition'] })
    const view = render(<RouterProvider router={router} />)
    await advance(0)
    return { actor, ...view }
  }

  // Un titre figure à la fois dans le catalogue et dans les téléchargements : on vise le tableau des téléchargements.
  const downloadsTable = () => screen.getByRole('table', { name: 'Téléchargements, du plus récent au plus ancien' })
  const rowOf = (title) => within(downloadsTable()).getByRole('row', { name: new RegExp(`^${title}`) })

  it('sans téléchargement actif, ne consulte la liste qu’une fois', async () => {
    list = [download('d1', 'Sintel', 'COMPLETED', 100)]
    await renderPage()
    expect(downloadReads()).toBe(1)
    await advance(DOWNLOADS_POLL_MS * 5)
    expect(downloadReads()).toBe(1)
  })

  it('met la progression à jour toutes les 3 s tant qu’un téléchargement est actif', async () => {
    list = (reads) => [download('d1', 'Sintel', 'DOWNLOADING', Math.min(100, reads * 25))]
    await renderPage()
    expect(within(rowOf('Sintel')).getByText('25 %')).toBeInTheDocument()

    await advance(DOWNLOADS_POLL_MS - 100)
    expect(downloadReads()).toBe(1) // pas plus souvent que toutes les 3 s
    await advance(200)
    expect(within(rowOf('Sintel')).getByText('50 %')).toBeInTheDocument()
    await advance(DOWNLOADS_POLL_MS)
    expect(within(rowOf('Sintel')).getByText('75 %')).toBeInTheDocument()
  })

  it('arrête le suivi quand plus aucun transfert n’est actif, et relit alors le catalogue', async () => {
    list = (reads) => (reads < 3 ? [download('d1', 'Sintel', 'DOWNLOADING', reads * 40)] : [download('d1', 'Sintel', 'COMPLETED', 100, { libraryMediaId: 'm9' })])
    entries = [entry('e1', 'Sintel', { activeDownloadId: 'd1' })]
    await renderPage()
    await advance(DOWNLOADS_POLL_MS)
    await advance(DOWNLOADS_POLL_MS)
    expect(within(rowOf('Sintel')).getAllByText('Terminé')[0]).toBeInTheDocument()

    // Le catalogue a été relu quand le dernier transfert s'est terminé (« Dans la bibliothèque » est alors possible).
    expect(calls.filter((call) => call === 'GET /catalogue').length).toBeGreaterThanOrEqual(2)
    const reads = downloadReads()
    await advance(DOWNLOADS_POLL_MS * 5)
    expect(downloadReads()).toBe(reads) // plus aucune consultation
  })

  it('lancer un téléchargement l’affiche tout de suite et relance le suivi', async () => {
    list = (reads) => (reads === 1 ? [] : [download('d-new', 'Nouveau', 'DOWNLOADING', reads * 10)])
    const { actor } = await renderPage()
    expect(downloadReads()).toBe(1)
    expect(screen.getByText(/Aucun téléchargement pour le moment/)).toBeInTheDocument()

    await actor.click(screen.getByRole('button', { name: 'Télécharger Sintel' }))
    await advance(0)
    expect(screen.getByText('Téléchargement de « Sintel » lancé.')).toBeInTheDocument()
    expect(within(rowOf('Nouveau')).getByText(/En cours|En file d’attente/)).toBeInTheDocument()

    const reads = downloadReads()
    await advance(DOWNLOADS_POLL_MS + 100)
    expect(downloadReads()).toBeGreaterThan(reads) // le suivi a redémarré
  })

  it('annuler met l’état à jour tout de suite et arrête le suivi', async () => {
    list = [download('d1', 'Sintel', 'DOWNLOADING', 40)]
    const { actor } = await renderPage()
    await actor.click(screen.getByRole('button', { name: 'Annuler le téléchargement de Sintel' }))
    await actor.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Annuler le téléchargement' }))
    await advance(0)

    expect(calls).toContain('POST /downloads/d1/cancel')
    expect(within(rowOf('Sintel')).getByText('Annulé')).toBeInTheDocument()
    expect(within(rowOf('Sintel')).queryByRole('button', { name: /Annuler le téléchargement/ })).not.toBeInTheDocument()
    expect(screen.getByText('Téléchargement de « Sintel » annulé.')).toBeInTheDocument()
    const reads = downloadReads()
    await advance(DOWNLOADS_POLL_MS * 4)
    expect(downloadReads()).toBe(reads)
  })

  it('annuler un téléchargement déjà terminé (409) l’explique et actualise la liste', async () => {
    list = [download('d1', 'Sintel', 'DOWNLOADING', 95)]
    cancelResponse = () => {
      list = [download('d1', 'Sintel', 'COMPLETED', 100)]
      return problem(409, 'CONFLICT')
    }
    const { actor } = await renderPage()
    await actor.click(screen.getByRole('button', { name: 'Annuler le téléchargement de Sintel' }))
    await actor.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Annuler le téléchargement' }))
    await advance(0)

    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('Ce téléchargement est déjà terminé ou annulé : la liste a été actualisée.')
    expect(within(rowOf('Sintel')).getByText('Terminé')).toBeInTheDocument()
  })

  it(`après ${DOWNLOADS_MAX_FAILURES} échecs de suite, le suivi s’interrompt et peut être repris`, async () => {
    list = [download('d1', 'Sintel', 'DOWNLOADING', 40)]
    const { actor } = await renderPage()
    listFailure = new TypeError('network')
    for (let i = 0; i < DOWNLOADS_MAX_FAILURES; i += 1) await advance(DOWNLOADS_POLL_MS)

    expect(screen.getByText(/Le suivi des téléchargements est interrompu/)).toBeInTheDocument()
    const stopped = downloadReads()
    await advance(DOWNLOADS_POLL_MS * 4)
    expect(downloadReads()).toBe(stopped)

    listFailure = null
    list = [download('d1', 'Sintel', 'COMPLETED', 100)]
    await actor.click(screen.getByRole('button', { name: 'Reprendre le suivi' }))
    await advance(DOWNLOADS_POLL_MS)
    expect(within(rowOf('Sintel')).getByText('Terminé')).toBeInTheDocument()
    expect(screen.queryByText(/suivi des téléchargements est interrompu/)).not.toBeInTheDocument()
  })

  it('ne consulte plus rien une fois la page quittée', async () => {
    list = [download('d1', 'Sintel', 'DOWNLOADING', 40)]
    const { unmount } = await renderPage()
    unmount()
    const reads = downloadReads()
    await advance(DOWNLOADS_POLL_MS * 5)
    expect(downloadReads()).toBe(reads)
  })

  it('une erreur au premier chargement est expliquée et réessayable, sans bloquer le catalogue', async () => {
    listFailure = new TypeError('network')
    const { actor } = await renderPage()
    expect(screen.getByRole('table', { name: 'Contenus autorisés au téléchargement' })).toBeInTheDocument()
    expect(screen.getByText('Impossible de joindre le serveur. Vérifiez votre connexion.')).toBeInTheDocument()

    listFailure = null
    await actor.click(screen.getByRole('button', { name: 'Réessayer' }))
    await advance(0)
    expect(screen.getByText(/Aucun téléchargement pour le moment/)).toBeInTheDocument()
  })
})
