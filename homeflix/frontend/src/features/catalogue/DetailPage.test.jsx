import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import mediaDetail from '@fixtures/library/media-detail.json'
import mediaUnavailable from '@fixtures/library/media-detail-unavailable.json'
import progressCompleted from '@fixtures/library/progress-completed.json'
import progressNotStarted from '@fixtures/library/progress-not-started.json'
import progressStarted from '@fixtures/library/progress-started.json'
import DetailPage from '@/features/catalogue/DetailPage'
import ProfileScope from '@/features/favourites/ProfileScope'

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const noContent = () => new Response(null, { status: 204 })

/**
 * Simule l'API Library pour un média : détail, progression et « Ma liste ».
 * `favourites` : liste des identifiants déjà dans « Ma liste » ; `null` simule une panne de cette route.
 */
function serve({ media = mediaDetail, progress = progressNotStarted, favourites = [] } = {}) {
  return async (url, init) => {
    const path = String(url)
    const method = init?.method ?? 'GET'
    if (path.includes('/me/favourites/')) return noContent()
    if (path.endsWith('/me/favourites') || path.includes('/me/favourites?')) {
      if (favourites === null) throw new TypeError('network')
      return json({ items: favourites.map((id) => ({ ...media, id })), page: 0, size: 50, total: favourites.length, totalPages: 1 })
    }
    if (path.endsWith('/progress')) {
      if (progress === null) throw new TypeError('network')
      return json({ ...progress, mediaId: media.id })
    }
    if (path.includes('/v1/media/') && method === 'GET') return json(media)
    throw new Error(`requête inattendue : ${method} ${path}`)
  }
}

function renderDetail(id = mediaDetail.id) {
  const router = createMemoryRouter(
    [
      { path: '/media/:mediaId', element: <DetailPage /> },
      { path: '/watch/:mediaId', element: <p>lecteur</p> },
      { path: '/catalogue', element: <p>catalogue</p> },
    ],
    { initialEntries: [`/media/${id}`] },
  )
  render(
    <ProfileScope>
      <RouterProvider router={router} />
    </ProfileScope>,
  )
  return router
}

describe('DetailPage', () => {
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn(serve())
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  const playLink = (name) => screen.findByRole('link', { name })

  it('affiche la fiche complète d’un film disponible', async () => {
    renderDetail()
    expect(await screen.findByRole('heading', { level: 1, name: 'Big Buck Bunny' })).toBeInTheDocument()
    expect(screen.getByText('2008 · Comédie familiale, Animation · 10 min')).toBeInTheDocument()
    expect(screen.getByText('Disponible')).toBeInTheDocument()
    expect(screen.getByText(mediaDetail.description)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Retour au catalogue' })).toHaveAttribute('href', '/catalogue')
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(
      expect.arrayContaining([
        `/api/library/v1/media/${mediaDetail.id}`,
        `/api/library/v1/media/${mediaDetail.id}/progress`,
      ]),
    )
  })

  it('annonce le chargement puis remplace par la fiche', async () => {
    renderDetail()
    expect(screen.getByRole('status')).toHaveTextContent('Chargement de la fiche du film')
    await screen.findByRole('heading', { level: 1, name: 'Big Buck Bunny' })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('propose « Lecture » quand rien n’est commencé', async () => {
    renderDetail()
    expect(await playLink('Lecture')).toHaveAttribute('href', `/watch/${mediaDetail.id}`)
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('propose « Reprendre à mm:ss » vers le lecteur, et la barre de progression', async () => {
    fetchMock.mockImplementation(serve({ progress: progressStarted })) // 212 s
    renderDetail()
    const link = await playLink('Reprendre à 3:32')
    expect(link).toHaveAttribute('href', `/watch/${mediaDetail.id}`) // aucune position dans l’URL
    expect(screen.getByRole('progressbar', { name: 'Progression de visionnage' })).toBeInTheDocument()
  })

  it('propose « Revoir » depuis le début quand le film est terminé', async () => {
    fetchMock.mockImplementation(serve({ progress: progressCompleted }))
    renderDetail()
    expect(await playLink('Revoir')).toHaveAttribute('href', `/watch/${mediaDetail.id}`)
  })

  it('reste lisible sans la progression (« Lecture » par défaut)', async () => {
    fetchMock.mockImplementation(serve({ progress: null }))
    renderDetail()
    expect(await playLink('Lecture')).toBeInTheDocument()
  })

  it('un film indisponible n’offre pas de lecture mais explique pourquoi', async () => {
    fetchMock.mockImplementation(serve({ media: mediaUnavailable }))
    renderDetail(mediaUnavailable.id)
    expect(await screen.findByRole('heading', { level: 1, name: 'Coffee Run' })).toBeInTheDocument()
    expect(screen.getByText('Indisponible')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent(/n’est pas disponible pour le moment.*administrateur/)
    expect(screen.queryByRole('link', { name: /Lecture|Reprendre|Revoir/ })).not.toBeInTheDocument()
  })

  it('un film en téléchargement n’offre pas de lecture et dit de patienter', async () => {
    fetchMock.mockImplementation(serve({ media: { ...mediaDetail, availability: 'DOWNLOADING' } }))
    renderDetail()
    expect(await screen.findByText('En téléchargement')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('en cours de téléchargement')
    expect(screen.queryByRole('link', { name: 'Lecture' })).not.toBeInTheDocument()
  })

  it('rend le titre et la description comme du texte brut, jamais comme du HTML', async () => {
    const hostile = {
      ...mediaDetail,
      posterUrl: null, // l'affiche de la fixture est une vraie image : on teste ici qu'aucun <img> ne vient du texte
      title: '<script>alert(1)</script> Titre',
      description: 'Ligne 1\n<img src=x onerror=alert(1)> <b>gras</b>',
    }
    fetchMock.mockImplementation(serve({ media: hostile }))
    renderDetail()
    const heading = await screen.findByRole('heading', { level: 1 })
    expect(heading.textContent).toBe('<script>alert(1)</script> Titre')
    expect(document.querySelector('img')).toBeNull()
    expect(document.querySelector('b')).toBeNull()
    expect(document.querySelector('article script')).toBeNull()
    expect(screen.getByText(/<img src=x onerror=alert\(1\)> <b>gras<\/b>/)).toBeInTheDocument()
  })

  it('affiche une affiche de remplacement sans image', async () => {
    fetchMock.mockImplementation(serve({ media: { ...mediaDetail, posterUrl: null } }))
    renderDetail()
    await screen.findByRole('heading', { level: 1 })
    expect(document.querySelector('.poster__placeholder')).not.toBeNull()
    expect(document.querySelector('img')).toBeNull()
  })

  it('affiche l’affiche quand elle existe', async () => {
    renderDetail()
    await screen.findByRole('heading', { level: 1 })
    expect(document.querySelector('img')).toHaveAttribute('src', mediaDetail.posterUrl)
  })

  describe('« Ma liste »', () => {
    it('ajoute le film via PUT', async () => {
      const user = userEvent.setup()
      renderDetail()
      const button = await screen.findByRole('button', { name: 'Ajouter à ma liste' })
      expect(button).toHaveAttribute('aria-pressed', 'false')
      await user.click(button)

      expect(await screen.findByRole('button', { name: 'Dans ma liste' })).toHaveAttribute('aria-pressed', 'true')
      const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')
      expect(call[0]).toBe(`/api/library/v1/me/favourites/${mediaDetail.id}`)
    })

    it('retire le film via DELETE quand il y est déjà', async () => {
      const user = userEvent.setup()
      fetchMock.mockImplementation(serve({ favourites: [mediaDetail.id] }))
      renderDetail()
      await user.click(await screen.findByRole('button', { name: 'Dans ma liste' }))

      expect(await screen.findByRole('button', { name: 'Ajouter à ma liste' })).toBeInTheDocument()
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true)
    })

    it('met le bouton à jour tout de suite, avant la réponse du serveur', async () => {
      const user = userEvent.setup()
      const respond = serve()
      let release
      fetchMock.mockImplementation(async (url, init) => {
        if (init?.method !== 'PUT') return respond(url, init)
        await new Promise((resolve) => {
          release = resolve
        })
        return noContent()
      })
      renderDetail()
      await user.click(await screen.findByRole('button', { name: 'Ajouter à ma liste' }))

      // La requête n'est pas terminée : l'état est déjà celui du succès, et le bouton est bloqué.
      const pressed = screen.getByRole('button', { name: 'Dans ma liste' })
      expect(pressed).toHaveAttribute('aria-pressed', 'true')
      expect(pressed).toBeDisabled()
      release()
      await waitFor(() => expect(screen.getByRole('button', { name: 'Dans ma liste' })).toBeEnabled())
    })

    it('restaure l’état précédent avec un message si la mise à jour échoue', async () => {
      const user = userEvent.setup()
      const respond = serve()
      fetchMock.mockImplementation(async (url, init) =>
        init?.method === 'PUT' ? json({ code: 'NOT_FOUND' }, 404) : respond(url, init),
      )
      renderDetail()
      await user.click(await screen.findByRole('button', { name: 'Ajouter à ma liste' }))

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('Impossible d’ajouter « Big Buck Bunny » à votre liste.')
      expect(alert).toHaveTextContent('introuvable')
      const restored = screen.getByRole('button', { name: 'Ajouter à ma liste' })
      expect(restored).toHaveAttribute('aria-pressed', 'false')
      expect(restored).toBeEnabled()
    })

    it('masque le bouton si l’état de la liste est inconnu, sans bloquer la fiche', async () => {
      fetchMock.mockImplementation(serve({ favourites: null }))
      renderDetail()
      expect(await playLink('Lecture')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /ma liste/i })).not.toBeInTheDocument()
    })
  })

  it('explique que le film est introuvable et propose de revenir au catalogue', async () => {
    fetchMock.mockImplementation(async () => json({ code: 'NOT_FOUND' }, 404))
    renderDetail('inconnu')
    expect(await screen.findByRole('heading', { name: 'Film introuvable' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Retour au catalogue' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument()
  })

  it('mène à la lecture au clic sur « Reprendre »', async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation(serve({ progress: progressStarted }))
    const router = renderDetail()
    await user.click(await playLink('Reprendre à 3:32'))
    await waitFor(() => expect(router.state.location.pathname).toBe(`/watch/${mediaDetail.id}`))
    expect(router.state.location.search).toBe('')
  })
})
