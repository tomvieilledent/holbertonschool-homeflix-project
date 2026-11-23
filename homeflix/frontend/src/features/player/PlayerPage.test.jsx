import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ticketFixture from '@fixtures/library/stream-ticket.json'
import PlayerPage, { startFromParams } from '@/features/player/PlayerPage'

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const MEDIA_ID = '304212f0-ed3f-518e-9417-9bd99f4e2ea3'
const NOT_STARTED = { mediaId: MEDIA_ID, positionSeconds: 0, durationSeconds: 596, state: 'NOT_STARTED' }
const isTicket = ([url]) => url.endsWith('/stream-ticket')
const callsTo = (fetchMock, predicate) => fetchMock.mock.calls.filter(predicate)

function renderPlayer(search = '') {
  const router = createMemoryRouter([{ path: '/watch/:mediaId', element: <PlayerPage /> }], {
    initialEntries: [`/watch/${MEDIA_ID}${search}`],
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
  let progress

  beforeEach(() => {
    progress = NOT_STARTED
    fetchMock = vi.fn(async (url) => json(url.endsWith('/progress') ? progress : ticketFixture))
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('demande un ticket puis charge le flux dans le lecteur', async () => {
    renderPlayer()
    expect(screen.getByRole('status')).toHaveTextContent('Préparation de la lecture')

    await waitFor(() => expect(video()).toHaveAttribute('src', ticketFixture.url))
    const [url, init] = callsTo(fetchMock, isTicket)[0]
    expect(url).toBe(`/api/library/v1/media/${MEDIA_ID}/stream-ticket`)
    expect(init.method).toBe('POST')
    expect(screen.getByRole('link', { name: 'Retour à la fiche' })).toHaveAttribute('href', `/media/${MEDIA_ID}`)
  })

  it('explique pourquoi la lecture est impossible (média indisponible)', async () => {
    fetchMock.mockImplementation(async (url) =>
      url.endsWith('/progress') ? json(NOT_STARTED) : json({ code: 'MEDIA_UNAVAILABLE' }, 409),
    )
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

    await waitFor(() => expect(callsTo(fetchMock, isTicket)).toHaveLength(2))
    await waitFor(() => expect(video()).not.toBeNull())
    Object.defineProperty(video(), 'duration', { value: 600, configurable: true })
    fireEvent.loadedMetadata(video())
    expect(video().currentTime).toBe(87)
  })

  it('affiche une erreur claire si la lecture échoue encore après le nouveau ticket', async () => {
    renderPlayer()
    await waitFor(() => expect(video()).not.toBeNull())
    failPlayback(4)
    await waitFor(() => expect(callsTo(fetchMock, isTicket)).toHaveLength(2))
    await waitFor(() => expect(video()).not.toBeNull())
    failPlayback(4)

    expect(await screen.findByText('Le format de cette vidéo n’est pas pris en charge.')).toBeInTheDocument()
    expect(callsTo(fetchMock, isTicket)).toHaveLength(2)
  })

  it('propose de réessayer après un échec du ticket', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url.endsWith('/progress')) return json(NOT_STARTED)
      throw new TypeError('network')
    })
    renderPlayer()
    await screen.findByRole('button', { name: 'Réessayer' })
    fetchMock.mockImplementation(async (url) => json(url.endsWith('/progress') ? NOT_STARTED : ticketFixture))
    fireEvent.click(await screen.findByRole('button', { name: 'Réessayer' }))
    await waitFor(() => expect(video()).not.toBeNull())
  })

  it('démarre à la position demandée dans l’URL (« Reprendre à … » depuis la fiche)', async () => {
    renderPlayer('?t=212')
    await waitFor(() => expect(video()).not.toBeNull())
    Object.defineProperty(video(), 'duration', { value: 596, configurable: true })
    fireEvent.loadedMetadata(video())
    expect(video().currentTime).toBe(212)
  })

  it('démarre au début sans position dans l’URL', async () => {
    renderPlayer()
    await waitFor(() => expect(video()).not.toBeNull())
    Object.defineProperty(video(), 'duration', { value: 596, configurable: true })
    fireEvent.loadedMetadata(video())
    expect(video().currentTime).toBe(0)
  })
})

describe('PlayerPage : reprise et sauvegarde', () => {
  let fetchMock
  let progress

  beforeEach(() => {
    progress = NOT_STARTED
    fetchMock = vi.fn(async (url, init) => {
      if (url.endsWith('/progress')) return init?.method === 'DELETE' ? new Response(null, { status: 204 }) : json(progress)
      return json(ticketFixture)
    })
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  const loadVideo = async (duration = 596) => {
    await waitFor(() => expect(video()).not.toBeNull())
    Object.defineProperty(video(), 'duration', { value: duration, configurable: true })
    fireEvent.loadedMetadata(video())
  }
  const progressPuts = () => callsTo(fetchMock, ([url, init]) => url.endsWith('/progress') && init?.method === 'PUT')

  it('reprend à la dernière position du profil quand l’URL n’en donne pas (rechargement)', async () => {
    progress = { ...NOT_STARTED, positionSeconds: 312, state: 'STARTED' }
    renderPlayer()
    await loadVideo()
    expect(video().currentTime).toBe(312)
  })

  it('repart du début pour un film terminé', async () => {
    progress = { ...NOT_STARTED, positionSeconds: 590, state: 'COMPLETED' }
    renderPlayer()
    await loadVideo()
    expect(video().currentTime).toBe(0)
  })

  it('la position de l’URL prime sur la progression enregistrée', async () => {
    progress = { ...NOT_STARTED, positionSeconds: 312, state: 'STARTED' }
    renderPlayer('?t=40')
    await loadVideo()
    expect(video().currentTime).toBe(40)
    expect(callsTo(fetchMock, ([url]) => url.endsWith('/progress'))).toHaveLength(0)
  })

  it('démarre au début si la progression est illisible', async () => {
    fetchMock.mockImplementation(async (url) =>
      url.endsWith('/progress') ? json({ code: 'INTERNAL_ERROR' }, 500) : json(ticketFixture),
    )
    renderPlayer()
    await loadVideo()
    expect(video().currentTime).toBe(0)
  })

  it('enregistre la position à la pause', async () => {
    renderPlayer()
    await loadVideo()
    video().currentTime = 123
    fireEvent.pause(video())

    await waitFor(() => expect(progressPuts()).toHaveLength(1))
    const [url, init] = progressPuts()[0]
    expect(url).toBe(`/api/library/v1/media/${MEDIA_ID}/progress`)
    expect(JSON.parse(init.body)).toEqual({ positionSeconds: 123, durationSeconds: 596 })
  })

  it('« Recommencer » efface la progression et repart du début', async () => {
    progress = { ...NOT_STARTED, positionSeconds: 312, state: 'STARTED' }
    renderPlayer()
    await loadVideo()
    fireEvent.click(screen.getByRole('button', { name: 'Recommencer' }))

    await waitFor(() =>
      expect(callsTo(fetchMock, ([, init]) => init?.method === 'DELETE')[0][0]).toBe(
        `/api/library/v1/media/${MEDIA_ID}/progress`,
      ),
    )
    await loadVideo()
    expect(video().currentTime).toBe(0)
    expect(progressPuts()).toHaveLength(0)
  })
})

describe('startFromParams', () => {
  it.each([
    ['', 0],
    ['t=212', 212],
    ['t=12.9', 12],
    ['t=0', 0],
    ['t=-5', 0],
    ['t=abc', 0],
    ['t=Infinity', 0],
  ])('?%s → %s s', (query, expected) => {
    expect(startFromParams(new URLSearchParams(query))).toBe(expected)
  })
})
