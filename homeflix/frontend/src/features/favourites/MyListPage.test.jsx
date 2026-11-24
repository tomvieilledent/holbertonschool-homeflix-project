import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import favouritesFixture from '@fixtures/library/favourites.json'
import MyListPage from '@/features/favourites/MyListPage'
import ProfileScope from '@/features/favourites/ProfileScope'

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const page = (items) => ({ items, page: 0, size: 50, total: items.length, totalPages: 1 })

const renderPage = () =>
  render(
    <ProfileScope>
      <MemoryRouter>
        <MyListPage />
      </MemoryRouter>
    </ProfileScope>,
  )

const titles = () => screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
const removeButton = (title) => screen.getByRole('button', { name: new RegExp(`retirer « ${title} »`) })

describe('MyListPage', () => {
  let fetchMock
  let release
  let writeFails

  function serve(items) {
    return async (url, init) => {
      const path = String(url)
      if (init?.method === 'DELETE' || init?.method === 'PUT') {
        await new Promise((resolve) => {
          release = resolve
        })
        return writeFails ? json({ code: 'INTERNAL_ERROR' }, 500) : new Response(null, { status: 204 })
      }
      if (path.includes('/me/favourites')) {
        if (items === null) throw new TypeError('network')
        return json(page(items))
      }
      throw new Error(`requête inattendue : ${path}`)
    }
  }

  beforeEach(() => {
    writeFails = false
    fetchMock = vi.fn(serve(favouritesFixture))
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('annonce le chargement puis liste les films, les plus récents en premier', async () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Ma liste' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Chargement de votre liste')

    expect(await screen.findByText(`${favouritesFixture.length} films dans votre liste`)).toBeInTheDocument()
    expect(titles()).toEqual(favouritesFixture.map((media) => media.title))
    expect(fetchMock.mock.calls[0][0]).toBe('/api/library/v1/me/favourites?page=0&size=50')
  })

  it('propose de parcourir le catalogue quand la liste est vide', async () => {
    fetchMock.mockImplementation(serve([]))
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Votre liste est vide' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Parcourir le catalogue' })).toHaveAttribute('href', '/catalogue')
  })

  it('propose de réessayer quand la liste ne se charge pas', async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementationOnce(serve(null))
    renderPage()
    expect(await screen.findByText('Impossible de charger votre liste pour le moment.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByText(`${favouritesFixture.length} films dans votre liste`)).toBeInTheDocument()
  })

  it('chaque carte annonce son état avec aria-pressed', async () => {
    renderPage()
    await screen.findByText(`${favouritesFixture.length} films dans votre liste`)
    for (const media of favouritesFixture) {
      expect(removeButton(media.title)).toHaveAttribute('aria-pressed', 'true')
    }
  })

  it('retire un film tout de suite et met le compteur à jour', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText(`${favouritesFixture.length} films dans votre liste`)
    const [removed, ...others] = favouritesFixture
    await user.click(removeButton(removed.title))

    expect(titles()).toEqual(others.map((media) => media.title))
    expect(screen.getByText(`${others.length} films dans votre liste`)).toBeInTheDocument()
    release()
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true))
  })

  it('remet le film à sa place avec un message si le serveur refuse', async () => {
    const user = userEvent.setup()
    writeFails = true
    renderPage()
    await screen.findByText(`${favouritesFixture.length} films dans votre liste`)
    const middle = favouritesFixture[1]
    await user.click(removeButton(middle.title))
    expect(titles()).not.toContain(middle.title)

    release()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(`Impossible de retirer « ${middle.title} » de votre liste.`)
    expect(titles()).toEqual(favouritesFixture.map((media) => media.title))
  })

  it('affiche « Votre liste est vide » après avoir retiré le dernier film', async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation(serve([favouritesFixture[0]]))
    renderPage()
    await screen.findByText('1 film dans votre liste')
    await user.click(removeButton(favouritesFixture[0].title))
    expect(await screen.findByRole('heading', { name: 'Votre liste est vide' })).toBeInTheDocument()
    expect(within(document.body).queryByRole('list')).not.toBeInTheDocument()
    release()
  })
})
