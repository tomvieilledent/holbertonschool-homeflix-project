import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AcquisitionPage from '@/features/admin/AcquisitionPage'

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const problem = (status, code) => json({ status, code, detail: 'java.net.SocketException: secret' }, status)

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

const NOTICE = { version: '2026-11', text: 'Ne téléchargez que des contenus dont vous détenez les droits.', acknowledged: false }

let entries
let rights
let writes // [{ method, path, body }]
let fail // { 'POST /downloads': réponse } : réponse à renvoyer une fois pour cette écriture
let fetchMock

function serve() {
  return async (url, init = {}) => {
    const path = String(url).replace('/api/acquisition/v1', '')
    const method = init.method ?? 'GET'
    const body = init.body ? JSON.parse(init.body) : undefined
    if (method === 'GET' && path.startsWith('/catalogue')) {
      const query = new URL(path, 'http://localhost').searchParams
      const page = Number(query.get('page') ?? 0)
      const size = Number(query.get('size') ?? 20)
      return json({ items: entries.slice(page * size, (page + 1) * size), page, size, total: entries.length, totalPages: Math.ceil(entries.length / size) })
    }
    if (method === 'GET' && path === '/rights-notice') return json(rights)
    writes.push({ method, path, body })
    const key = `${method} ${path}`
    if (fail[key]) {
      const response = fail[key]
      delete fail[key]
      return response
    }
    if (key === 'POST /rights-notice/ack') {
      rights = { ...rights, acknowledged: true }
      return json(rights)
    }
    if (key === 'POST /downloads') {
      entries = entries.map((item) => (item.id === body.catalogueEntryId ? { ...item, activeDownloadId: 'd1' } : item))
      return json({ id: 'd1', catalogueEntryId: body.catalogueEntryId, title: 'x', state: 'QUEUED', progressPercent: 0 }, 202)
    }
    throw new Error(`requête inattendue : ${key}`)
  }
}

function renderPage(url = '/admin/acquisition') {
  const router = createMemoryRouter([{ path: '/admin/acquisition', element: <AcquisitionPage /> }], { initialEntries: [url] })
  render(<RouterProvider router={router} />)
  return router
}

const dialog = () => screen.getByRole('dialog')
const downloadButton = (title) => screen.getByRole('button', { name: `Télécharger ${title}` })
const downloads = () => writes.filter((write) => write.path === '/downloads')
const acks = () => writes.filter((write) => write.path === '/rights-notice/ack')

describe('AcquisitionPage', () => {
  beforeEach(() => {
    entries = [
      entry('e1', 'Sintel'),
      entry('e2', 'Big Buck Bunny', { inLibrary: true, libraryMediaId: 'm9' }),
      entry('e3', 'Spring', { activeDownloadId: 'd0' }),
    ]
    rights = { ...NOTICE }
    writes = []
    fail = {}
    fetchMock = vi.fn(serve())
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  describe('catalogue', () => {
    it('annonce le chargement puis liste les contenus avec leur source, leur licence et la preuve', async () => {
      renderPage()
      expect(screen.getByRole('status')).toHaveTextContent('Chargement du catalogue')

      expect(await screen.findByRole('table')).toBeInTheDocument()
      const row = screen.getByRole('row', { name: /^Sintel/ })
      expect(within(row).getByText('Blender Foundation')).toBeInTheDocument()
      expect(within(row).getByText('CC BY 3.0')).toBeInTheDocument()
      expect(within(row).getByText('334 Mo')).toBeInTheDocument()
      const proof = within(row).getByRole('link', { name: 'Preuve de la licence de Sintel (s’ouvre dans un nouvel onglet)' })
      expect(proof).toHaveAttribute('href', 'https://studio.blender.org/films/')
      expect(proof).toHaveAttribute('target', '_blank')
      expect(proof).toHaveAttribute('rel', 'noopener noreferrer')
      expect(fetchMock.mock.calls[0][0]).toBe('/api/acquisition/v1/catalogue?page=0&size=20')
    })

    it('n’offre aucun champ pour saisir une adresse : on ne choisit que parmi les contenus autorisés', async () => {
      renderPage()
      await screen.findByRole('table')
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      expect(document.querySelector('input[type=url], input[type=text], input[type=search], textarea')).toBeNull()
      expect(screen.getByText(/Il n’est pas possible de saisir une adresse/)).toBeInTheDocument()
    })

    it('distingue un film déjà dans la bibliothèque, un téléchargement en cours et un film à télécharger', async () => {
      renderPage()
      await screen.findByRole('table')
      const inLibrary = screen.getByRole('row', { name: /^Big Buck Bunny/ })
      expect(within(inLibrary).getByText(/Dans la bibliothèque/)).toBeInTheDocument()
      expect(within(inLibrary).getByRole('link', { name: 'Voir Big Buck Bunny dans la bibliothèque' })).toHaveAttribute('href', '/media/m9')
      expect(within(inLibrary).queryByRole('button')).not.toBeInTheDocument()

      const active = screen.getByRole('row', { name: /^Spring/ })
      expect(within(active).getByText('Téléchargement en cours')).toBeInTheDocument()
      expect(within(active).queryByRole('button')).not.toBeInTheDocument()

      expect(downloadButton('Sintel')).toBeEnabled()
    })

    it('n’affiche jamais une preuve de licence qui ne serait pas une adresse http(s)', async () => {
      entries = [entry('e1', 'Piège', { licenseProofUrl: 'javascript:alert(1)' })]
      renderPage()
      await screen.findByRole('table')
      expect(screen.getByText('Preuve indisponible')).toBeInTheDocument()
      expect(document.querySelector('a[href^="javascript:"]')).toBeNull()
    })

    it('propose de réessayer quand le catalogue ne se charge pas, sans détail technique', async () => {
      fetchMock.mockResolvedValueOnce(problem(503, 'LIBRARY_UNAVAILABLE'))
      renderPage()
      expect(await screen.findByText(/momentanément indisponible/)).toBeInTheDocument()
      expect(document.body).not.toHaveTextContent('SocketException')
      await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
      expect(await screen.findByRole('table')).toBeInTheDocument()
    })

    it('pagine le catalogue et revient à la dernière page si elle n’existe plus', async () => {
      entries = Array.from({ length: 45 }, (_, index) => entry(`e${index}`, `Film ${index}`))
      const router = renderPage('/admin/acquisition?page=9')
      await waitFor(() => expect(router.state.location.search).toBe('?page=3'))
      expect(await screen.findByRole('link', { name: 'Page 2' })).toHaveAttribute('href', '/admin/acquisition?page=2')
    })
  })

  describe('le premier téléchargement exige l’acquittement du rappel des droits', () => {
    it('annonce d’avance qu’un rappel sera à accepter', async () => {
      renderPage()
      await screen.findByRole('table')
      expect(screen.getByText(/vous devrez lire et accepter le rappel des droits/)).toBeInTheDocument()
    })

    it('affiche le rappel avant de télécharger : texte, version, case à cocher obligatoire, rien d’envoyé', async () => {
      renderPage()
      await screen.findByRole('table')
      await userEvent.click(downloadButton('Sintel'))

      expect(dialog()).toHaveAccessibleName('Rappel des droits')
      expect(within(dialog()).getByText(NOTICE.text)).toBeInTheDocument()
      expect(within(dialog()).getByText(/version\s+2026-11/)).toBeInTheDocument()
      expect(within(dialog()).getByRole('checkbox')).toHaveFocus()
      expect(within(dialog()).getByRole('button', { name: 'Accepter et télécharger' })).toBeDisabled()
      expect(writes).toHaveLength(0)
    })

    it('affiche le texte du rappel comme du texte, jamais comme du HTML', async () => {
      rights = { ...NOTICE, text: '<img src=x onerror=alert(1)> Rappel' }
      renderPage()
      await screen.findByRole('table')
      await userEvent.click(downloadButton('Sintel'))
      expect(within(dialog()).getByText('<img src=x onerror=alert(1)> Rappel')).toBeInTheDocument()
      expect(dialog().querySelector('img')).toBeNull()
    })

    it('« Annuler » et Échap ne téléchargent rien et n’acquittent rien', async () => {
      renderPage()
      await screen.findByRole('table')
      await userEvent.click(downloadButton('Sintel'))
      await userEvent.click(within(dialog()).getByRole('checkbox'))
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Annuler' }))
      expect(screen.queryByRole('dialog')).toBeNull()

      await userEvent.click(downloadButton('Sintel'))
      await userEvent.keyboard('{Escape}')
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(writes).toHaveLength(0)
    })

    it('accepter acquitte la version lue puis lance le téléchargement, avec le seul identifiant de l’entrée', async () => {
      renderPage()
      await screen.findByRole('table')
      await userEvent.click(downloadButton('Sintel'))
      await userEvent.click(within(dialog()).getByRole('checkbox'))
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Accepter et télécharger' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(writes).toEqual([
        { method: 'POST', path: '/rights-notice/ack', body: { noticeVersion: '2026-11' } },
        { method: 'POST', path: '/downloads', body: { catalogueEntryId: 'e1' } },
      ])
      expect(screen.getByText('Téléchargement de « Sintel » lancé.')).toBeInTheDocument()
      expect(await within(screen.getByRole('row', { name: /^Sintel/ })).findByText('Téléchargement en cours')).toBeInTheDocument()
    })

    it('le rappel n’est plus demandé ensuite : le deuxième téléchargement part directement', async () => {
      entries = [entry('e1', 'Sintel'), entry('e4', 'Wing It!')]
      renderPage()
      await screen.findByRole('table')
      await userEvent.click(downloadButton('Sintel'))
      await userEvent.click(within(dialog()).getByRole('checkbox'))
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Accepter et télécharger' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      writes = []

      await userEvent.click(await screen.findByRole('button', { name: 'Télécharger Wing It!' }))
      await waitFor(() => expect(downloads()).toHaveLength(1))
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(acks()).toHaveLength(0)
      expect(downloads()[0].body).toEqual({ catalogueEntryId: 'e4' })
    })

    it('un compte qui a déjà accepté ne revoit pas le rappel', async () => {
      rights = { ...NOTICE, acknowledged: true }
      renderPage()
      await screen.findByRole('table')
      expect(screen.queryByText(/vous devrez lire et accepter/)).not.toBeInTheDocument()
      await userEvent.click(downloadButton('Sintel'))
      await waitFor(() => expect(downloads()).toHaveLength(1))
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(acks()).toHaveLength(0)
    })

    it('si le texte a changé entre-temps (409), il est relu et doit être accepté de nouveau', async () => {
      renderPage()
      await screen.findByRole('table')
      await userEvent.click(downloadButton('Sintel'))
      fail['POST /rights-notice/ack'] = problem(409, 'CONFLICT')
      rights = { version: '2026-12', text: 'Nouveau texte du rappel.', acknowledged: false } // publié depuis le chargement
      await userEvent.click(within(dialog()).getByRole('checkbox'))
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Accepter et télécharger' }))

      expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Le rappel des droits a été mis à jour. Relisez-le, puis acceptez-le de nouveau.')
      expect(within(dialog()).getByText('Nouveau texte du rappel.')).toBeInTheDocument()
      expect(within(dialog()).getByRole('checkbox')).not.toBeChecked()
      expect(downloads()).toHaveLength(0)
    })

    it('si le serveur exige encore l’acquittement (412), le rappel est relu et affiché', async () => {
      rights = { ...NOTICE, acknowledged: true }
      renderPage()
      await screen.findByRole('table')
      fail['POST /downloads'] = problem(412, 'RIGHTS_NOT_ACKNOWLEDGED')
      rights = { version: '2026-12', text: 'Texte de la nouvelle version.', acknowledged: false }
      await userEvent.click(downloadButton('Sintel'))

      expect(await screen.findByRole('dialog')).toHaveAccessibleName('Rappel des droits')
      expect(within(dialog()).getByText('Texte de la nouvelle version.')).toBeInTheDocument()
    })

    it('le rappel accepté mais le téléchargement refusé : on l’explique, et le rappel n’est pas redemandé', async () => {
      renderPage()
      await screen.findByRole('table')
      await userEvent.click(downloadButton('Sintel'))
      fail['POST /downloads'] = problem(503, 'TORRENT_CLIENT_UNAVAILABLE')
      await userEvent.click(within(dialog()).getByRole('checkbox'))
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Accepter et télécharger' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Le service de téléchargement est injoignable.')
      expect(document.body).not.toHaveTextContent('SocketException')
      expect(screen.queryByRole('dialog')).toBeNull()
      await userEvent.click(downloadButton('Sintel'))
      await waitFor(() => expect(downloads()).toHaveLength(2))
      expect(acks()).toHaveLength(1)
    })
  })

  it('explique un téléchargement déjà actif sans détail technique', async () => {
    rights = { ...NOTICE, acknowledged: true }
    renderPage()
    await screen.findByRole('table')
    fail['POST /downloads'] = problem(409, 'DOWNLOAD_ALREADY_ACTIVE')
    await userEvent.click(downloadButton('Sintel'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Un téléchargement est déjà en cours pour ce contenu.')
  })
})
