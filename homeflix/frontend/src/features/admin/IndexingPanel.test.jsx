import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import IndexingPanel from '@/features/admin/IndexingPanel'
import { MAX_POLL_FAILURES, POLL_INTERVAL_MS } from '@/features/admin/useIndexJob'

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/problem+json' } })

const job = (state, counters = {}) => ({
  jobId: 'j1',
  state,
  scanned: 0,
  added: 0,
  updated: 0,
  markedUnavailable: 0,
  duplicates: 0,
  errors: 0,
  startedAt: state === 'IDLE' ? null : '2026-11-23T10:00:00Z',
  finishedAt: state === 'COMPLETED' || state === 'FAILED' ? '2026-11-23T10:00:08Z' : null,
  ...counters,
})

let statuses // réponses successives de GET /admin/index/status (la dernière se répète) ou fonctions qui lèvent
let started // réponse de POST /admin/index
let fetchMock
let calls

const gets = () => calls.filter((call) => call.method === 'GET').length

function serve() {
  return async (url, init = {}) => {
    const method = init.method ?? 'GET'
    calls.push({ method, path: String(url) })
    if (method === 'POST') return started()
    const next = statuses.length > 1 ? statuses.shift() : statuses[0]
    if (next instanceof Error) throw next
    return typeof next === 'function' ? next() : json(next)
  }
}

/** Fait avancer le temps simulé, en laissant les requêtes et les rendus se terminer. */
const advance = (ms) => act(async () => vi.advanceTimersByTimeAsync(ms))
const launchButton = () => screen.getByRole('button', { name: /Lancer l’indexation/ }) // le nom s'allonge pendant le chargement
const status = () => screen.getByText(/Indexation|indexation/, { selector: '[role=status]' })

describe('IndexingPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    statuses = [job('IDLE')]
    started = () => json(job('RUNNING', { scanned: 4 }), 202)
    calls = []
    fetchMock = vi.fn(serve())
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const renderPanel = async () => {
    const actor = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const view = render(<IndexingPanel />)
    await advance(0)
    return { actor, ...view }
  }

  it('désactive le bouton tant que le premier état n’est pas connu, puis l’active', async () => {
    let release
    statuses = [() => new Promise((resolve) => { release = () => resolve(json(job('IDLE'))) })]
    const actor = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<IndexingPanel />)
    expect(launchButton()).toBeDisabled()
    release()
    await advance(0)
    expect(launchButton()).toBeEnabled()
    expect(actor).toBeDefined()
  })

  it('sans indexation, le dit et n’affiche aucun compteur', async () => {
    await renderPanel()
    expect(screen.getByText('Aucune indexation n’a encore été lancée.')).toBeInTheDocument()
    expect(screen.queryByText('Analysés')).not.toBeInTheDocument()
    expect(launchButton()).toBeEnabled()
  })

  it('lancer : le bouton se désactive aussitôt, la progression se met à jour seule, le résultat final reste affiché', async () => {
    statuses = [job('IDLE'), job('RUNNING', { scanned: 14, added: 4 }), job('RUNNING', { scanned: 28, added: 8 }), job('COMPLETED', { scanned: 42, added: 12, duplicates: 1 })]
    const { actor } = await renderPanel()

    await actor.click(launchButton())
    expect(launchButton()).toBeDisabled() // dès le clic, avant même la réponse du serveur
    await advance(0)
    expect(calls.at(-1)).toEqual({ method: 'POST', path: '/api/library/v1/admin/index' })
    expect(launchButton()).toBeDisabled()
    expect(screen.getByText('Indexation en cours…')).toBeInTheDocument()
    expect(screen.getByText('Une indexation est en cours.')).toBeInTheDocument()

    await advance(POLL_INTERVAL_MS)
    expect(screen.getByText('14')).toBeInTheDocument() // analysés
    await advance(POLL_INTERVAL_MS)
    expect(screen.getByText('28')).toBeInTheDocument()
    expect(launchButton()).toBeDisabled()

    await advance(POLL_INTERVAL_MS)
    expect(screen.getByText(/Indexation terminée à/)).toHaveTextContent('12 films ajoutés, 0 mis à jour, 0 manquant.')
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(launchButton()).toBeEnabled()
    expect(screen.queryByText('Une indexation est en cours.')).not.toBeInTheDocument()
  })

  it('ne consulte pas le serveur plus souvent que toutes les 2 secondes', async () => {
    statuses = [job('IDLE'), job('RUNNING', { scanned: 5 })]
    const { actor } = await renderPanel()
    await actor.click(launchButton())
    await advance(0)
    const before = gets()

    await advance(POLL_INTERVAL_MS - 100)
    expect(gets()).toBe(before)
    await advance(200)
    expect(gets()).toBe(before + 1)
  })

  it('arrête le suivi à la fin du scan', async () => {
    statuses = [job('RUNNING', { scanned: 3 }), job('COMPLETED', { scanned: 9, added: 2 })]
    await renderPanel()
    await advance(POLL_INTERVAL_MS)
    expect(screen.getByText(/Indexation terminée/)).toBeInTheDocument()
    const done = gets()

    await advance(POLL_INTERVAL_MS * 5)
    expect(gets()).toBe(done)
  })

  it('reprend le suivi d’un scan déjà en cours au chargement (bouton désactivé)', async () => {
    statuses = [job('RUNNING', { scanned: 8, added: 3 }), job('COMPLETED', { scanned: 20, added: 6 })]
    await renderPanel()
    expect(launchButton()).toBeDisabled()
    expect(screen.getByText('8')).toBeInTheDocument()

    await advance(POLL_INTERVAL_MS)
    expect(screen.getByText(/Indexation terminée/)).toBeInTheDocument()
    expect(launchButton()).toBeEnabled()
  })

  it('un scan déjà en cours côté serveur (409) est suivi, sans message d’erreur', async () => {
    started = () => json({ status: 409, code: 'INDEX_ALREADY_RUNNING' }, 409)
    statuses = [job('IDLE'), job('RUNNING', { scanned: 30 }), job('COMPLETED', { scanned: 50, added: 1 })]
    const { actor } = await renderPanel()

    await actor.click(launchButton())
    await advance(0)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Indexation en cours…')).toBeInTheDocument()
    expect(launchButton()).toBeDisabled()
    await advance(POLL_INTERVAL_MS)
    expect(screen.getByText(/Indexation terminée/)).toBeInTheDocument()
  })

  it('explique un échec de lancement sans détail technique et laisse réessayer', async () => {
    started = () => json({ status: 500, code: 'INTERNAL_ERROR', detail: 'java.lang.NullPointerException' }, 500)
    const { actor } = await renderPanel()
    await actor.click(launchButton())
    await advance(0)

    expect(screen.getByRole('alert')).toHaveTextContent('Une erreur est survenue de notre côté.')
    expect(document.body).not.toHaveTextContent('NullPointerException')
    expect(launchButton()).toBeEnabled()
  })

  it('affiche un scan en échec avec une piste, et permet de relancer', async () => {
    statuses = [job('FAILED', { scanned: 3, errors: 3 })]
    await renderPanel()
    expect(screen.getByText(/L’indexation a échoué/)).toBeInTheDocument()
    expect(launchButton()).toBeEnabled()
  })

  it('met les erreurs en évidence et dit quoi vérifier', async () => {
    statuses = [job('COMPLETED', { scanned: 10, added: 7, errors: 2 })]
    await renderPanel()
    expect(screen.getByText('Erreurs').closest('div')).toHaveClass('indexing__counter--alert')
    expect(screen.getByText(/2 fichiers n’ont pas pu être lus/)).toBeInTheDocument()
  })

  describe('suivi interrompu', () => {
    it('une consultation qui échoue une fois est simplement rejouée', async () => {
      statuses = [job('RUNNING', { scanned: 3 }), new TypeError('network'), job('COMPLETED', { scanned: 9 })]
      await renderPanel()
      await advance(POLL_INTERVAL_MS) // échec
      expect(screen.queryByText(/suivi de l’indexation est interrompu/)).not.toBeInTheDocument()
      await advance(POLL_INTERVAL_MS)
      expect(screen.getByText(/Indexation terminée/)).toBeInTheDocument()
    })

    it(`après ${MAX_POLL_FAILURES} échecs de suite, le suivi s’interrompt et propose de le reprendre`, async () => {
      statuses = [job('RUNNING', { scanned: 3 }), new TypeError('network')]
      const { actor } = await renderPanel()
      for (let i = 0; i < MAX_POLL_FAILURES; i += 1) await advance(POLL_INTERVAL_MS)

      expect(screen.getByText(/suivi de l’indexation est interrompu/)).toBeInTheDocument()
      const stopped = gets()
      await advance(POLL_INTERVAL_MS * 4)
      expect(gets()).toBe(stopped) // plus de requêtes tant qu'on ne reprend pas

      statuses = [job('COMPLETED', { scanned: 9, added: 2 })]
      await actor.click(screen.getByRole('button', { name: 'Reprendre le suivi' }))
      await advance(POLL_INTERVAL_MS)
      expect(screen.getByText(/Indexation terminée/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Reprendre le suivi' })).not.toBeInTheDocument()
    })
  })

  it('ne consulte plus rien une fois le panneau fermé', async () => {
    statuses = [job('RUNNING', { scanned: 3 })]
    const { unmount } = await renderPanel()
    unmount()
    const before = gets()
    await advance(POLL_INTERVAL_MS * 5)
    expect(gets()).toBe(before)
  })

  it('signale un état illisible sans bloquer la page', async () => {
    statuses = [() => json({ status: 503, code: 'LIBRARY_UNAVAILABLE' }, 503)]
    await renderPanel()
    expect(screen.getByRole('alert')).toHaveTextContent('La bibliothèque est momentanément indisponible.')
    expect(status).toBeDefined()
  })
})
