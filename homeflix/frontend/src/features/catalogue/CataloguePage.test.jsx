import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import genres from '@fixtures/library/genres.json'
import mediaPage from '@fixtures/library/media-page.json'
import mediaPageEmpty from '@fixtures/library/media-page-empty.json'
import CataloguePage, {
  catalogueUrl,
  filtersFromParams,
  PAGE_SIZE,
  pageFromParams,
} from '@/features/catalogue/CataloguePage'

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// 45 films construits à partir de la fixture : 3 pages de 20, 20 et 5.
const ALL = Array.from({ length: 45 }, (_, index) => ({
  ...mediaPage.items[index % mediaPage.items.length],
  id: `m${index}`,
  title: `Film ${String(index + 1).padStart(2, '0')}`,
}))

/** Simule `GET /media` : filtre `q` (titre) et `genre`, puis tranche selon `page` et `size` (à partir de 0). */
const serve = (all) => async (url) => {
  if (String(url).includes('/v1/genres')) return json(genres)
  const query = new URL(url, 'http://localhost').searchParams
  const q = query.get('q')?.toLowerCase()
  const genre = query.get('genre')
  const items = all
    .filter((media) => !q || media.title.toLowerCase().includes(q))
    .filter((media) => !genre || media.genres.includes(genre))
  const page = Number(query.get('page') ?? 0)
  const size = Number(query.get('size') ?? PAGE_SIZE)
  return json({
    items: items.slice(page * size, (page + 1) * size),
    page,
    size,
    total: items.length,
    totalPages: Math.ceil(items.length / size),
  })
}

function renderCatalogue(url = '/catalogue') {
  const router = createMemoryRouter([{ path: '/catalogue', element: <CataloguePage /> }], {
    initialEntries: [url],
  })
  render(<RouterProvider router={router} />)
  return router
}

const titles = () => screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)

describe('pageFromParams', () => {
  it.each([
    ['', 1],
    ['page=3', 3],
    ['page=0', 1],
    ['page=-2', 1],
    ['page=abc', 1],
    ['page=2.5', 2],
  ])('?%s → page %s', (query, expected) => {
    expect(pageFromParams(new URLSearchParams(query))).toBe(expected)
  })
})

describe('CataloguePage', () => {
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn(serve(ALL))
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('annonce le chargement puis affiche la première page de la grille', async () => {
    renderCatalogue()
    expect(screen.getByRole('status')).toHaveTextContent('Chargement du catalogue')
    expect(await screen.findByRole('heading', { level: 3, name: 'Film 01' })).toBeInTheDocument()
    expect(titles()).toHaveLength(PAGE_SIZE)
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/library/v1/media?page=0&size=${PAGE_SIZE}`)
    expect(screen.getByText('Page 1 sur 3')).toBeInTheDocument()
  })

  it('lit la page dans l’URL', async () => {
    renderCatalogue('/catalogue?page=3')
    expect(await screen.findByRole('heading', { level: 3, name: 'Film 41' })).toBeInTheDocument()
    expect(titles()).toHaveLength(5)
    expect(fetchMock.mock.calls[0][0]).toContain('page=2')
  })

  it('change de page au clavier, met l’URL à jour et rend le focus au titre', async () => {
    const user = userEvent.setup()
    const router = renderCatalogue()
    await screen.findByRole('heading', { level: 3, name: 'Film 01' })

    const nav = screen.getByRole('navigation', { name: 'Pagination du catalogue' })
    within(nav).getByRole('link', { name: 'Page suivante' }).focus()
    await user.keyboard('{Enter}')

    expect(await screen.findByRole('heading', { level: 3, name: 'Film 21' })).toBeInTheDocument()
    expect(router.state.location.search).toBe('?page=2')
    expect(screen.getByRole('heading', { level: 1, name: 'Catalogue' })).toHaveFocus()
    expect(screen.getByText('Page 2 sur 3')).toBeInTheDocument()
  })

  it('revient à la première page sans paramètre dans l’URL', async () => {
    const user = userEvent.setup()
    const router = renderCatalogue('/catalogue?page=2')
    await screen.findByRole('heading', { level: 3, name: 'Film 21' })
    await user.click(screen.getByRole('link', { name: 'Page 1' }))
    expect(await screen.findByRole('heading', { level: 3, name: 'Film 01' })).toBeInTheDocument()
    expect(router.state.location.search).toBe('')
  })

  it('traite une page invalide comme la page 1', async () => {
    renderCatalogue('/catalogue?page=abc')
    expect(await screen.findByRole('heading', { level: 3, name: 'Film 01' })).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][0]).toContain('page=0')
  })

  it('ramène à la dernière page quand la page demandée n’existe pas', async () => {
    const router = renderCatalogue('/catalogue?page=99')
    await waitFor(() => expect(router.state.location.search).toBe('?page=3'))
    expect(await screen.findByRole('heading', { level: 3, name: 'Film 41' })).toBeInTheDocument()
  })

  it('invite à contacter l’administrateur quand le catalogue est vide', async () => {
    fetchMock.mockImplementation(async () => json(mediaPageEmpty))
    renderCatalogue()
    expect(await screen.findByRole('heading', { name: 'Le catalogue est vide' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Pagination du catalogue' })).not.toBeInTheDocument()
  })

  it('propose de réessayer quand le chargement échoue', async () => {
    const user = userEvent.setup()
    fetchMock.mockRejectedValueOnce(new TypeError('network'))
    renderCatalogue()
    await user.click(await screen.findByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByRole('heading', { level: 3, name: 'Film 01' })).toBeInTheDocument()
  })
})

describe('filtersFromParams et catalogueUrl', () => {
  it('lit la recherche (nettoyée) et le genre', () => {
    expect(filtersFromParams(new URLSearchParams('q=%20sintel%20&genre=Animation'))).toEqual({
      q: 'sintel',
      genre: 'Animation',
    })
    expect(filtersFromParams(new URLSearchParams(''))).toEqual({ q: '', genre: '' })
  })

  it('garde la recherche et le genre dans l’URL d’une page', () => {
    const params = new URLSearchParams('q=sintel&genre=Animation&page=2')
    expect(catalogueUrl(params, 3)).toBe('/catalogue?q=sintel&genre=Animation&page=3')
    expect(catalogueUrl(params, 1)).toBe('/catalogue?q=sintel&genre=Animation')
    expect(catalogueUrl(new URLSearchParams('page=2'), 1)).toBe('/catalogue')
  })
})

describe('CataloguePage : recherche et filtres', () => {
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn(serve(ALL))
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  const mediaCalls = () =>
    fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.includes('/v1/media'))
  const input = () => screen.getByRole('searchbox', { name: 'Rechercher un titre' })
  const SIX = ['Film 40', 'Film 41', 'Film 42', 'Film 43', 'Film 44', 'Film 45']

  it('met les résultats à jour en tapant, après un délai, et écrit la recherche dans l’URL', async () => {
    const user = userEvent.setup()
    const router = renderCatalogue()
    await screen.findByRole('heading', { level: 3, name: 'Film 01' })
    const before = mediaCalls().length

    await user.type(input(), 'Film 4')
    expect(mediaCalls()).toHaveLength(before) // pas de requête à chaque frappe

    await waitFor(() => expect(mediaCalls().at(-1)).toContain('q=Film+4'), { timeout: 2000 })
    expect(mediaCalls()).toHaveLength(before + 1) // une seule requête pour toute la saisie
    expect(await screen.findByText('6 résultats')).toBeInTheDocument()
    expect(titles()).toEqual(SIX)
    expect(router.state.location.search).toBe('?q=Film+4')
  })

  it('lit la recherche et le genre dans l’URL au chargement (lien partagé)', async () => {
    renderCatalogue('/catalogue?q=Film+4&genre=Animation')
    expect(input()).toHaveValue('Film 4')
    await waitFor(() => expect(mediaCalls()).toHaveLength(1))
    expect(mediaCalls()[0]).toContain('q=Film+4')
    expect(mediaCalls()[0]).toContain('genre=Animation')
    expect(await screen.findByRole('combobox', { name: 'Genre' })).toHaveValue('Animation')
  })

  it('filtre par genre tout de suite et revient à la première page', async () => {
    const user = userEvent.setup()
    const router = renderCatalogue('/catalogue?page=2')
    await screen.findByRole('heading', { level: 3, name: 'Film 21' })
    const select = await screen.findByRole('combobox', { name: 'Genre' })
    expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Tous les genres',
      ...genres,
    ])

    await user.selectOptions(select, 'Animation')

    await waitFor(() => expect(mediaCalls().at(-1)).toContain('genre=Animation'))
    expect(mediaCalls().at(-1)).toContain('page=0')
    expect(router.state.location.search).toBe('?genre=Animation')
    const expected = ALL.filter((media) => media.genres.includes('Animation')).length
    expect(await screen.findByText(`${expected} résultat${expected > 1 ? 's' : ''}`)).toBeInTheDocument()
  })

  it('annule la requête périmée : une réponse tardive ne remplace pas la dernière', async () => {
    const user = userEvent.setup()
    const respond = serve(ALL)
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url).includes('q=Film+2')) {
        await new Promise((resolve) => setTimeout(resolve, 400)) // répond tard, sans respecter l’annulation
      }
      return respond(url, init)
    })
    renderCatalogue('/catalogue?q=Film+2')
    await waitFor(() => expect(mediaCalls()).toHaveLength(1))
    const firstSignal = fetchMock.mock.calls.find(([url]) => String(url).includes('q=Film+2'))[1].signal

    await user.clear(input())
    await user.type(input(), 'Film 4')
    await waitFor(() => expect(mediaCalls().at(-1)).toContain('q=Film+4'), { timeout: 2000 })
    expect(firstSignal.aborted).toBe(true)

    await screen.findByText('6 résultats')
    await new Promise((resolve) => setTimeout(resolve, 500)) // laisse arriver la réponse périmée
    expect(titles()).toEqual(SIX)
  })

  it('dit « aucun résultat » avec des pistes, et efface les filtres d’un clic', async () => {
    const user = userEvent.setup()
    const router = renderCatalogue('/catalogue?q=zzz')
    expect(await screen.findByRole('heading', { name: 'Aucun résultat pour « zzz »' })).toBeInTheDocument()
    expect(screen.getByText(/Vérifiez l’orthographe/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Effacer la recherche et les filtres' }))

    expect(await screen.findByRole('heading', { level: 3, name: 'Film 01' })).toBeInTheDocument()
    expect(router.state.location.search).toBe('')
    expect(input()).toHaveValue('')
  })

  it('garde la recherche dans les liens de pagination', async () => {
    renderCatalogue('/catalogue?q=Film')
    await screen.findByRole('heading', { level: 3, name: 'Film 01' })
    expect(screen.getByRole('link', { name: 'Page 2' })).toHaveAttribute('href', '/catalogue?q=Film&page=2')
  })

  it('ne vole pas le focus du champ quand la recherche ramène à la première page', async () => {
    const user = userEvent.setup()
    renderCatalogue('/catalogue?page=2')
    await screen.findByRole('heading', { level: 3, name: 'Film 21' })
    await user.type(input(), 'Film 4')
    await screen.findByText('6 résultats')
    expect(input()).toHaveFocus()
  })

  it('reste utilisable sans le sélecteur de genre quand la liste des genres échoue', async () => {
    const respond = serve(ALL)
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url).includes('/v1/genres')) throw new TypeError('network')
      return respond(url, init)
    })
    renderCatalogue()
    await screen.findByRole('heading', { level: 3, name: 'Film 01' })
    expect(screen.queryByRole('combobox', { name: 'Genre' })).not.toBeInTheDocument()
    expect(input()).toBeInTheDocument()
  })
})
