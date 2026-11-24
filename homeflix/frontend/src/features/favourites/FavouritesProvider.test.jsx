import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ToastProvider from '@/components/Toast'
import FavouritesProvider from '@/features/favourites/FavouritesProvider'
import { useFavourites } from '@/features/favourites/favouritesContext'

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const media = (id) => ({ id, title: `Film ${id}`, availability: 'AVAILABLE', genres: [] })
const A = media('a')
const B = media('b')
const C = media('c')
const D = media('d')

/** Affiche l'état du magasin et expose un bouton par action, pour piloter le magasin comme le ferait une vue. */
function Probe({ name = 'sonde', target = D }) {
  const favourites = useFavourites()
  return (
    <section aria-label={name}>
      <p>statut : {favourites.status}</p>
      <p>liste : {favourites.items.map((item) => item.id).join(',') || 'vide'}</p>
      <p>
        {target.id} {favourites.isFavourite(target.id) ? 'favori' : 'pas favori'},{' '}
        {favourites.isPending(target.id) ? 'en cours' : 'au repos'}
      </p>
      <button type="button" onClick={() => favourites.toggle(target)}>
        basculer {target.id}
      </button>
      <button type="button" onClick={favourites.reload}>
        recharger
      </button>
    </section>
  )
}

const renderStore = (...probes) =>
  render(
    <ToastProvider>
      <FavouritesProvider>{probes.length > 0 ? probes : <Probe />}</FavouritesProvider>
    </ToastProvider>,
  )

const listText = () => screen.getByText(/^liste :/).textContent

describe('FavouritesProvider', () => {
  let fetchMock
  let release
  let writeStatus

  /** Pages de `GET /me/favourites` (`pages`), et écritures retenues jusqu'à `release()`. */
  function serve(pages) {
    return async (url) => {
      const path = String(url)
      if (path.includes('/me/favourites/')) {
        await new Promise((resolve) => {
          release = resolve
        })
        return writeStatus === 204 ? new Response(null, { status: 204 }) : json({ code: 'INTERNAL_ERROR' }, writeStatus)
      }
      const page = Number(new URL(path, 'http://localhost').searchParams.get('page') ?? 0)
      return json({ items: pages[page] ?? [], page, size: 50, total: 0, totalPages: pages.length })
    }
  }

  beforeEach(() => {
    writeStatus = 204
    fetchMock = vi.fn(serve([[A, B, C]]))
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('charge « Ma liste » une fois, les plus récents en premier', async () => {
    renderStore()
    expect(screen.getByText('statut : loading')).toBeInTheDocument()
    expect(await screen.findByText('statut : ready')).toBeInTheDocument()
    expect(listText()).toBe('liste : a,b,c')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('parcourt toutes les pages', async () => {
    fetchMock.mockImplementation(serve([[A], [B], [C]]))
    renderStore()
    await screen.findByText('statut : ready')
    expect(listText()).toBe('liste : a,b,c')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('passe en erreur si la liste est injoignable ou invalide, et se recharge à la demande', async () => {
    const user = userEvent.setup()
    fetchMock.mockRejectedValueOnce(new TypeError('network'))
    renderStore()
    expect(await screen.findByText('statut : error')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'recharger' }))
    expect(await screen.findByText('statut : ready')).toBeInTheDocument()
    expect(listText()).toBe('liste : a,b,c')

    fetchMock.mockResolvedValueOnce(json({ pas: 'une page' }))
    await user.click(screen.getByRole('button', { name: 'recharger' }))
    expect(await screen.findByText('statut : error')).toBeInTheDocument()
  })

  it('ajoute en tête tout de suite, avant la réponse du serveur', async () => {
    const user = userEvent.setup()
    renderStore()
    await screen.findByText('statut : ready')
    await user.click(screen.getByRole('button', { name: 'basculer d' }))

    expect(listText()).toBe('liste : d,a,b,c')
    expect(screen.getByText('d favori, en cours')).toBeInTheDocument()
    await act(async () => release())
    expect(await screen.findByText('d favori, au repos')).toBeInTheDocument()
    expect(fetchMock.mock.calls.at(-1)[1].method).toBe('PUT')
  })

  it('retire tout de suite, puis appelle DELETE', async () => {
    const user = userEvent.setup()
    renderStore(<Probe target={B} />)
    await screen.findByText('statut : ready')
    await user.click(screen.getByRole('button', { name: 'basculer b' }))

    expect(listText()).toBe('liste : a,c')
    await act(async () => release())
    await waitFor(() => expect(screen.getByText('b pas favori, au repos')).toBeInTheDocument())
    expect(fetchMock.mock.calls.at(-1)[1].method).toBe('DELETE')
  })

  it('annule un ajout refusé et affiche un message', async () => {
    const user = userEvent.setup()
    writeStatus = 500
    renderStore()
    await screen.findByText('statut : ready')
    await user.click(screen.getByRole('button', { name: 'basculer d' }))
    expect(listText()).toBe('liste : d,a,b,c')

    await act(async () => release())
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible d’ajouter « Film d » à votre liste.')
    expect(listText()).toBe('liste : a,b,c')
    expect(screen.getByText('d pas favori, au repos')).toBeInTheDocument()
  })

  it('annule un retrait refusé : le film retrouve sa place d’origine', async () => {
    const user = userEvent.setup()
    writeStatus = 500
    renderStore(<Probe target={B} />)
    await screen.findByText('statut : ready')
    await user.click(screen.getByRole('button', { name: 'basculer b' }))
    expect(listText()).toBe('liste : a,c')

    await act(async () => release())
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de retirer « Film b » de votre liste.')
    expect(listText()).toBe('liste : a,b,c')
  })

  it('résout true en cas de succès et false en cas d’échec', async () => {
    const handle = { current: null }
    function Grab() {
      const store = useFavourites()
      useEffect(() => {
        handle.current = store
      })
      return null
    }
    renderStore(<Grab key="g" />)
    await waitFor(() => expect(handle.current?.status).toBe('ready'))

    let outcome
    await act(async () => {
      const promise = handle.current.toggle(D).then((result) => (outcome = result))
      await Promise.resolve()
      release()
      await promise
    })
    expect(outcome).toBe(true)

    writeStatus = 500
    await act(async () => {
      const promise = handle.current.toggle(C).then((result) => (outcome = result))
      await Promise.resolve()
      release()
      await promise
    })
    expect(outcome).toBe(false)
  })

  it('ignore un second basculement du même film tant que le premier est en cours', async () => {
    const user = userEvent.setup()
    renderStore()
    await screen.findByText('statut : ready')
    const button = screen.getByRole('button', { name: 'basculer d' })
    await user.click(button)
    await user.click(button)

    await act(async () => release())
    await screen.findByText('d favori, au repos')
    const writes = fetchMock.mock.calls.filter(([url]) => String(url).includes('/me/favourites/'))
    expect(writes).toHaveLength(1)
  })

  it('partage le même état entre toutes les vues', async () => {
    const user = userEvent.setup()
    renderStore(<Probe key="1" name="accueil" />, <Probe key="2" name="fiche" />)
    await waitFor(() => expect(screen.getAllByText('statut : ready')).toHaveLength(2))

    await user.click(screen.getAllByRole('button', { name: 'basculer d' })[0])
    // La vue qui n'a pas reçu le clic est déjà à jour.
    expect(screen.getAllByText('liste : d,a,b,c')).toHaveLength(2)
    expect(screen.getAllByText('d favori, en cours')).toHaveLength(2)
    await act(async () => release())
  })

  it('lève une erreur claire hors du fournisseur', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow('useFavourites doit être utilisé dans un <FavouritesProvider>')
    error.mockRestore()
  })
})
