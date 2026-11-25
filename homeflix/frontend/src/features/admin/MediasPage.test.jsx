import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import mediaPage from '@fixtures/library/media-page.json'
import MediasPage from '@/features/admin/MediasPage'

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const problem = (status, code, extra = {}) => json({ status, code, detail: 'org.hibernate.Exception secret', ...extra }, status)

const BIG = mediaPage.items.find((media) => media.title === 'Big Buck Bunny')
const SINTEL = mediaPage.items.find((media) => media.title === 'Sintel')

let media // état de l'API simulée
let fetchMock
let writes // [{ method, path, body }]
let failWith // réponse à renvoyer à la prochaine écriture

function serve() {
  return async (url, init = {}) => {
    const path = String(url)
    const method = init.method ?? 'GET'
    const body = init.body ? JSON.parse(init.body) : undefined
    if (method === 'GET' && path.startsWith('/api/library/v1/media')) {
      const query = new URL(path, 'http://localhost').searchParams
      const q = query.get('q')?.toLowerCase()
      const page = Number(query.get('page') ?? 0)
      const size = Number(query.get('size') ?? 20)
      const found = media.filter((item) => !q || item.title.toLowerCase().includes(q))
      return json({ items: found.slice(page * size, (page + 1) * size), page, size, total: found.length, totalPages: Math.ceil(found.length / size) })
    }
    writes.push({ method, path, body })
    if (failWith) {
      const response = failWith
      failWith = null
      return response
    }
    const id = path.split('/').pop()
    if (method === 'PATCH') {
      media = media.map((item) => (item.id === id ? { ...item, ...body } : item))
      return json(media.find((item) => item.id === id))
    }
    if (method === 'DELETE') {
      media = media.filter((item) => item.id !== id)
      return new Response(null, { status: 204 })
    }
    throw new Error(`requête inattendue : ${method} ${path}`)
  }
}

function renderPage(url = '/admin/medias') {
  const router = createMemoryRouter([{ path: '/admin/medias', element: <MediasPage /> }], { initialEntries: [url] })
  render(<RouterProvider router={router} />)
  return router
}

const rowOf = (title) => screen.getByRole('row', { name: new RegExp(`^${title}`) })
const dialog = () => screen.getByRole('dialog')
const field = (name) => within(dialog()).getByLabelText(name)

describe('MediasPage', () => {
  beforeEach(() => {
    media = structuredClone(mediaPage.items)
    writes = []
    failWith = null
    fetchMock = vi.fn(serve())
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  describe('liste et recherche', () => {
    it('annonce le chargement puis liste les films avec leurs métadonnées et leur disponibilité', async () => {
      renderPage()
      expect(screen.getByRole('status')).toHaveTextContent('Chargement des films')

      expect(await screen.findByRole('table')).toBeInTheDocument()
      expect(screen.getByText(`${media.length} films`)).toBeInTheDocument()
      const row = within(rowOf('Big Buck Bunny'))
      expect(row.getByText(String(BIG.year))).toBeInTheDocument()
      expect(row.getByText(BIG.genres.join(', '))).toBeInTheDocument()
      expect(row.getByText('Disponible')).toBeInTheDocument()
      expect(fetchMock.mock.calls[0][0]).toBe('/api/library/v1/media?page=0&size=20')
    })

    it('recherche par titre, dans l’adresse de la page', async () => {
      const router = renderPage()
      await screen.findByRole('table')
      await userEvent.type(screen.getByLabelText('Rechercher un titre'), 'sintel{Enter}')

      await waitFor(() => expect(screen.getByText('1 film pour « sintel »')).toBeInTheDocument())
      expect(router.state.location.search).toBe('?q=sintel')
      expect(screen.queryByRole('row', { name: /Big Buck Bunny/ })).not.toBeInTheDocument()
    })

    it('dit quand la recherche ne trouve rien', async () => {
      renderPage('/admin/medias?q=zzz')
      expect(await screen.findByRole('heading', { name: 'Aucun film pour « zzz »' })).toBeInTheDocument()
    })

    it('propose de réessayer quand la liste ne se charge pas, sans détail technique', async () => {
      fetchMock.mockResolvedValueOnce(problem(500, 'INTERNAL_ERROR'))
      renderPage()
      expect(await screen.findByText(/Une erreur est survenue de notre côté/)).toBeInTheDocument()
      expect(document.body).not.toHaveTextContent('hibernate')
      await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
      expect(await screen.findByRole('table')).toBeInTheDocument()
    })
  })

  describe('modification', () => {
    const open = async (title = 'Big Buck Bunny') => {
      renderPage()
      await screen.findByRole('table')
      await userEvent.click(screen.getByRole('button', { name: `Modifier ${title}` }))
    }

    it('ouvre un formulaire prérempli, accessible, dont le premier champ a le focus', async () => {
      await open()
      expect(dialog()).toHaveAccessibleName('Modifier le film')
      expect(field(/Titre/)).toHaveFocus()
      expect(field(/Titre/)).toHaveValue(BIG.title)
      expect(field('Description')).toHaveValue(BIG.description)
      expect(field('Genres')).toHaveValue(BIG.genres.join(', '))
      expect(field('Année')).toHaveValue(BIG.year)
    })

    it('rappelle les limites sous chaque champ', async () => {
      await open()
      expect(within(dialog()).getByText(`${BIG.title.length} / 200 caractères.`)).toBeInTheDocument()
      expect(within(dialog()).getByText(`${BIG.description.length} / 2000 caractères.`)).toBeInTheDocument()
      expect(within(dialog()).getByText(/10 genres au maximum, de 40 caractères au plus/)).toBeInTheDocument()
      expect(within(dialog()).getByText(/Entre 1888 et 2100/)).toBeInTheDocument()
    })

    it('n’envoie rien quand rien n’a changé', async () => {
      await open()
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Enregistrer' }))
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(writes).toHaveLength(0)
    })

    it('signale chaque champ invalide sans appeler le serveur', async () => {
      await open()
      await userEvent.clear(field(/Titre/))
      await userEvent.clear(field('Année'))
      await userEvent.type(field('Année'), '1500')
      await userEvent.clear(field('Genres'))
      await userEvent.type(field('Genres'), 'x'.repeat(41))
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Enregistrer' }))

      expect(within(dialog()).getByText('Le titre est obligatoire.')).toBeInTheDocument()
      expect(within(dialog()).getByText('L’année doit être un nombre entier entre 1888 et 2100.')).toBeInTheDocument()
      expect(within(dialog()).getByText(/dépasse 40 caractères/)).toBeInTheDocument()
      expect(field(/Titre/)).toBeInvalid()
      expect(writes).toHaveLength(0)
    })

    it('un titre de plus de 200 caractères est expliqué, pas tronqué en silence', async () => {
      await open()
      await userEvent.clear(field(/Titre/))
      await userEvent.click(field(/Titre/))
      await userEvent.paste('x'.repeat(201))
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Enregistrer' }))
      expect(within(dialog()).getByText('Le titre ne doit pas dépasser 200 caractères.')).toBeInTheDocument()
      expect(writes).toHaveLength(0)
    })

    it('envoie seulement les champs modifiés, puis annonce le résultat et recharge la liste', async () => {
      await open()
      await userEvent.clear(field(/Titre/))
      await userEvent.type(field(/Titre/), '  Big Buck Bunny (version restaurée) ')
      await userEvent.clear(field('Genres'))
      await userEvent.type(field('Genres'), 'Animation, Court métrage')
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Enregistrer' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(writes[0]).toEqual({
        method: 'PATCH',
        path: `/api/library/v1/admin/media/${BIG.id}`,
        body: { title: 'Big Buck Bunny (version restaurée)', genres: ['Animation', 'Court métrage'] },
      })
      expect(screen.getByText('« Big Buck Bunny (version restaurée) » a été mis à jour.')).toBeInTheDocument()
      expect(await screen.findByRole('row', { name: /Big Buck Bunny \(version restaurée\)/ })).toBeInTheDocument()
      expect(within(rowOf('Big Buck Bunny \\(version restaurée\\)')).getByText('Animation, Court métrage')).toBeInTheDocument()
    })

    it('affiche l’erreur de validation du serveur sous le champ concerné', async () => {
      await open()
      failWith = problem(400, 'VALIDATION_ERROR', { errors: [{ field: 'title', message: 'Titre refusé par le serveur.' }] })
      await userEvent.type(field(/Titre/), ' (HD)')
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Enregistrer' }))
      expect(await within(dialog()).findByText('Titre refusé par le serveur.')).toBeInTheDocument()
      expect(dialog()).toBeInTheDocument()
    })

    it('n’affiche aucun détail technique si le serveur échoue, et laisse réessayer', async () => {
      await open()
      failWith = problem(500, 'INTERNAL_ERROR')
      await userEvent.type(field(/Titre/), ' (HD)')
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Enregistrer' }))
      expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Une erreur est survenue de notre côté.')
      expect(document.body).not.toHaveTextContent('hibernate')
      expect(within(dialog()).getByRole('button', { name: 'Enregistrer' })).toBeEnabled()
    })

    it('Échap ferme sans rien enregistrer', async () => {
      await open()
      await userEvent.type(field(/Titre/), ' (HD)')
      await userEvent.keyboard('{Escape}')
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(writes).toHaveLength(0)
    })
  })

  describe('retrait d’une entrée', () => {
    const open = async () => {
      renderPage()
      await screen.findByRole('table')
      await userEvent.click(screen.getByRole('button', { name: `Retirer ${SINTEL.title} du catalogue` }))
    }

    it('précise que le fichier source est conservé, et demande confirmation', async () => {
      await open()
      expect(dialog()).toHaveAccessibleName(`Retirer « ${SINTEL.title} » du catalogue ?`)
      expect(within(dialog()).getByText(/Le fichier du film n’est ni modifié ni supprimé/)).toBeInTheDocument()
      expect(within(dialog()).getByText(/il reste sur votre disque/)).toBeInTheDocument()
      expect(within(dialog()).getByText(/ne sera pas recréée par les prochaines indexations/)).toBeInTheDocument()
      expect(within(dialog()).getByRole('button', { name: 'Annuler' })).toHaveFocus()
      expect(writes).toHaveLength(0)
    })

    it('retire l’entrée après confirmation', async () => {
      await open()
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Retirer du catalogue' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(writes[0]).toMatchObject({ method: 'DELETE', path: `/api/library/v1/admin/media/${SINTEL.id}` })
      expect(screen.getByText(`« ${SINTEL.title} » a été retiré du catalogue.`)).toBeInTheDocument()
      await waitFor(() => expect(screen.queryByRole('row', { name: new RegExp(`^${SINTEL.title}`) })).not.toBeInTheDocument())
    })

    it('« Annuler » ne retire rien', async () => {
      await open()
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Annuler' }))
      expect(writes).toHaveLength(0)
      expect(rowOf(SINTEL.title)).toBeInTheDocument()
    })

    it('un échec est expliqué sans détail technique et garde la confirmation ouverte', async () => {
      await open()
      failWith = problem(404, 'NOT_FOUND')
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Retirer du catalogue' }))
      expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Cet élément est introuvable.')
      expect(document.body).not.toHaveTextContent('hibernate')
    })
  })

  it('pagine la liste et revient à la dernière page si elle n’existe plus', async () => {
    media = Array.from({ length: 45 }, (_, index) => ({ ...BIG, id: `m${index}`, title: `Film ${String(index).padStart(2, '0')}` }))
    const router = renderPage('/admin/medias?page=9')
    await waitFor(() => expect(router.state.location.search).toBe('?page=3'))
    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Page 2' })).toHaveAttribute('href', '/admin/medias?page=2')
  })
})
