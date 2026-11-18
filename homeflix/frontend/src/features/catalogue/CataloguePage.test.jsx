import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import mediaPage from '@fixtures/library/media-page.json'
import mediaPageEmpty from '@fixtures/library/media-page-empty.json'
import CataloguePage, { PAGE_SIZE, pageFromParams } from '@/features/catalogue/CataloguePage'

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// 45 films construits à partir de la fixture : 3 pages de 20, 20 et 5.
const ALL = Array.from({ length: 45 }, (_, index) => ({
  ...mediaPage.items[index % mediaPage.items.length],
  id: `m${index}`,
  title: `Film ${String(index + 1).padStart(2, '0')}`,
}))

/** Simule `GET /media` : tranche selon `page` et `size` (à partir de 0). */
const serve = (items) => async (url) => {
  const query = new URL(url, 'http://localhost').searchParams
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
