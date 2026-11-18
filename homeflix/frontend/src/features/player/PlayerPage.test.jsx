import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ticketFixture from '@fixtures/library/stream-ticket.json'
import PlayerPage from '@/features/player/PlayerPage'

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const MEDIA_ID = '304212f0-ed3f-518e-9417-9bd99f4e2ea3'

function renderPlayer() {
  const router = createMemoryRouter([{ path: '/watch/:mediaId', element: <PlayerPage /> }], {
    initialEntries: [`/watch/${MEDIA_ID}`],
  })
  render(<RouterProvider router={router} />)
}

const video = () => document.querySelector('video')

/** Simule l'échec de lecture du navigateur sur la balise `<video>` (code MediaError). */
function failPlayback(code, currentTime = 0) {
  const element = video()
  element.currentTime = currentTime
  Object.defineProperty(element, 'error', { value: { code }, configurable: true })
  fireEvent.error(element)
}

describe('PlayerPage', () => {
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn(async () => json(ticketFixture))
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('demande un ticket puis charge le flux dans le lecteur', async () => {
    renderPlayer()
    expect(screen.getByRole('status')).toHaveTextContent('Préparation de la lecture')

    await waitFor(() => expect(video()).toHaveAttribute('src', ticketFixture.url))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`/api/library/v1/media/${MEDIA_ID}/stream-ticket`)
    expect(init.method).toBe('POST')
    expect(screen.getByRole('link', { name: 'Retour à la fiche' })).toHaveAttribute('href', `/media/${MEDIA_ID}`)
  })

  it('explique pourquoi la lecture est impossible (média indisponible)', async () => {
    fetchMock.mockImplementation(async () => json({ code: 'MEDIA_UNAVAILABLE' }, 409))
    renderPlayer()
    expect(await screen.findByRole('heading', { name: 'Lecture impossible' })).toBeInTheDocument()
    expect(screen.getByText('Ce film n’est pas disponible pour le moment.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Retour à la fiche' })).toBeInTheDocument()
    expect(document.querySelector('video')).toBeNull()
  })

  it('redemande un ticket une fois quand le flux est refusé, et reprend à la même position', async () => {
    renderPlayer()
    await waitFor(() => expect(video()).not.toBeNull())
    failPlayback(2, 87)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(video()).not.toBeNull())
    Object.defineProperty(video(), 'duration', { value: 600, configurable: true })
    fireEvent.loadedMetadata(video())
    expect(video().currentTime).toBe(87)
  })

  it('affiche une erreur claire si la lecture échoue encore après le nouveau ticket', async () => {
    renderPlayer()
    await waitFor(() => expect(video()).not.toBeNull())
    failPlayback(4)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(video()).not.toBeNull())
    failPlayback(4)

    expect(await screen.findByText('Le format de cette vidéo n’est pas pris en charge.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('propose de réessayer après un échec du ticket', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network'))
    renderPlayer()
    fireEvent.click(await screen.findByRole('button', { name: 'Réessayer' }))
    await waitFor(() => expect(video()).not.toBeNull())
  })
})
