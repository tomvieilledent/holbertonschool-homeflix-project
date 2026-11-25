import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import home from '@fixtures/library/home.json'
import homeEmpty from '@fixtures/library/home-empty.json'
import { AuthContext } from '@/features/auth/authContext'
import HomePage from '@/features/catalogue/HomePage'
import ProfileScope from '@/features/favourites/ProfileScope'

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const noContent = () => new Response(null, { status: 204 })

const favouritesPage = (items) => ({ items, page: 0, size: 50, total: items.length, totalPages: 1 })

/**
 * Simule l'API Library : `GET /home`, `GET /me/favourites` (`favourites` ; `null` simule une panne) et les
 * `PUT` / `DELETE /me/favourites/{id}`.
 */
function serve({ homeBody = home, favourites = home.favourites } = {}) {
  return async (url) => {
    const path = String(url)
    if (path.includes('/me/favourites/')) return noContent()
    if (path.includes('/me/favourites')) {
      if (favourites === null) throw new TypeError('network')
      return json(favouritesPage(favourites))
    }
    if (path.endsWith('/home')) return json(homeBody)
    throw new Error(`requête inattendue : ${path}`)
  }
}

const renderHome = () =>
  render(
    <AuthContext.Provider value={{ account: { id: '1', username: 'camille', role: 'USER' } }}>
      <ProfileScope>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </ProfileScope>
    </AuthContext.Provider>,
  )

const row = (name) => screen.getByRole('region', { name })
const titlesIn = (region) => within(region).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
const favouriteButton = (region, verb, title) =>
  within(region).getByRole('button', { name: new RegExp(`${verb} « ${title} »`) })

describe('HomePage', () => {
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn(serve())
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('affiche un chargement annoncé puis les quatre sections', async () => {
    renderHome()
    expect(screen.getByRole('status')).toHaveTextContent('Chargement de l’accueil')

    expect(await screen.findByRole('region', { name: 'Continuer à regarder' })).toBeInTheDocument()
    expect(row('Ajoutés récemment')).toBeInTheDocument()
    for (const category of home.categories) expect(row(category.genre)).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Ma liste' })).toBeInTheDocument()
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toContain('/api/library/v1/home')
  })

  it('remplit chaque rangée avec les films de la réponse', async () => {
    renderHome()
    await screen.findByRole('region', { name: 'Ma liste' })
    expect(within(row('Continuer à regarder')).getAllByRole('listitem')).toHaveLength(home.continueWatching.length)
    expect(within(row('Ajoutés récemment')).getAllByRole('listitem')).toHaveLength(home.recentlyAdded.length)
    expect(within(row('Ma liste')).getAllByRole('listitem')).toHaveLength(home.favourites.length)
  })

  it('montre la progression sur « Continuer à regarder » seulement', async () => {
    renderHome()
    await screen.findByRole('region', { name: 'Continuer à regarder' })
    expect(within(row('Continuer à regarder')).getAllByRole('progressbar')).toHaveLength(home.continueWatching.length)
    expect(within(row('Ajoutés récemment')).queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('explique quoi attendre quand la bibliothèque est vide (voir `EmptyLibrary` pour chaque rôle)', async () => {
    fetchMock.mockImplementation(serve({ homeBody: homeEmpty, favourites: [] }))
    renderHome()
    expect(await screen.findByRole('heading', { name: 'Aucun film pour le moment' })).toBeInTheDocument()
  })

  it('masque les rangées vides et explique « Ma liste » vide', async () => {
    fetchMock.mockImplementation(serve({ homeBody: { ...homeEmpty, recentlyAdded: home.recentlyAdded }, favourites: [] }))
    renderHome()
    await screen.findByRole('region', { name: 'Ajoutés récemment' })
    expect(screen.queryByRole('region', { name: 'Continuer à regarder' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Animation' })).not.toBeInTheDocument()
    expect(await screen.findByText(/Votre liste est vide/)).toBeInTheDocument()
  })

  it('propose de réessayer quand le chargement échoue', async () => {
    const user = userEvent.setup()
    const respond = serve()
    let failed = false
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url).endsWith('/home') && !failed) {
        failed = true
        throw new TypeError('network')
      }
      return respond(url, init)
    })
    renderHome()
    await user.click(await screen.findByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByRole('region', { name: 'Ma liste' })).toBeInTheDocument()
  })

  it('sans « Ma liste » disponible, masque la rangée et les boutons sans bloquer l’accueil', async () => {
    fetchMock.mockImplementation(serve({ favourites: null }))
    renderHome()
    expect(await screen.findByRole('region', { name: 'Ajoutés récemment' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Ma liste' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ma liste/i })).not.toBeInTheDocument()
  })

  describe('« Ma liste » (mise à jour optimiste)', () => {
    /** Les requêtes d'écriture restent en attente jusqu'à `release()` ; `fail` les fait échouer. */
    function holdWrites({ fail = false } = {}) {
      const respond = serve()
      let release
      const gate = new Promise((resolve) => {
        release = resolve
      })
      fetchMock.mockImplementation(async (url, init) => {
        if (init?.method !== 'PUT' && init?.method !== 'DELETE') return respond(url, init)
        await gate
        return fail ? json({ code: 'INTERNAL_ERROR' }, 500) : noContent()
      })
      return release
    }

    it('retire un film de la rangée tout de suite, puis appelle DELETE', async () => {
      const user = userEvent.setup()
      const release = holdWrites()
      renderHome()
      const list = await screen.findByRole('region', { name: 'Ma liste' })
      const first = home.favourites[0]
      await user.click(favouriteButton(list, 'retirer', first.title))

      // Le serveur n'a pas encore répondu : le film a déjà quitté la rangée.
      expect(within(row('Ma liste')).getAllByRole('listitem')).toHaveLength(home.favourites.length - 1)
      release()
      await waitFor(() => {
        const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'DELETE')
        expect(call[0]).toBe(`/api/library/v1/me/favourites/${first.id}`)
      })
    })

    it('ajoute un film en tête de « Ma liste » tout de suite et met à jour toutes ses cartes', async () => {
      const user = userEvent.setup()
      const release = holdWrites()
      renderHome()
      const recent = await screen.findByRole('region', { name: 'Ajoutés récemment' })
      await screen.findByRole('region', { name: 'Ma liste' })
      const candidate = home.recentlyAdded.find((media) => !home.favourites.some((fav) => fav.id === media.id))
      expect(candidate).toBeDefined() // la fixture offre au moins un film à ajouter
      await user.click(favouriteButton(recent, 'ajouter', candidate.title))

      expect(within(row('Ma liste')).getAllByRole('listitem')).toHaveLength(home.favourites.length + 1)
      expect(titlesIn(row('Ma liste'))[0]).toBe(candidate.title)
      // Toutes les cartes de ce film (ici « Ajoutés récemment » et « Ma liste ») affichent le nouvel état.
      for (const button of screen.getAllByRole('button', { name: new RegExp(`retirer « ${candidate.title} »`) })) {
        expect(button).toHaveAttribute('aria-pressed', 'true')
      }
      release()
      await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true))
    })

    it('si le serveur refuse, le film revient à sa place avec un message', async () => {
      const user = userEvent.setup()
      const release = holdWrites({ fail: true })
      renderHome()
      const list = await screen.findByRole('region', { name: 'Ma liste' })
      const before = titlesIn(list)
      const removed = home.favourites[0]
      await user.click(favouriteButton(list, 'retirer', removed.title))
      expect(titlesIn(row('Ma liste'))).toEqual(before.filter((title) => title !== removed.title))

      release()
      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent(`Impossible de retirer « ${removed.title} » de votre liste.`)
      expect(titlesIn(row('Ma liste'))).toEqual(before)
      expect(favouriteButton(row('Ma liste'), 'retirer', removed.title)).toHaveAttribute('aria-pressed', 'true')
    })

    it('bloque un second clic sur le même film tant que sa requête est en cours', async () => {
      const user = userEvent.setup()
      const release = holdWrites()
      renderHome()
      const list = await screen.findByRole('region', { name: 'Ma liste' })
      const first = home.favourites[0]
      await user.click(favouriteButton(list, 'retirer', first.title))
      const again = screen.getAllByRole('button', { name: new RegExp(`« ${first.title} »`) })
      for (const button of again) expect(button).toBeDisabled()
      release()
      await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(1))
    })
  })
})
