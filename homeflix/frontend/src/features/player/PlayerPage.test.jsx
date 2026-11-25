import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ticketFixture from '@fixtures/library/stream-ticket.json'
import PlayerPage from '@/features/player/PlayerPage'

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

  it('démarre au début quand rien n’est commencé', async () => {
    renderPlayer()
    await waitFor(() => expect(video()).not.toBeNull())
    Object.defineProperty(video(), 'duration', { value: 596, configurable: true })
    fireEvent.loadedMetadata(video())
    expect(video().currentTime).toBe(0)
  })
})

describe('PlayerPage : erreurs de lecture', () => {
  let fetchMock
  let streamReply

  beforeEach(() => {
    streamReply = () => new Response(null, { status: 206 })
    fetchMock = vi.fn(async (url) => {
      if (url.endsWith('/progress')) return json(NOT_STARTED)
      if (isTicket([url])) return json(ticketFixture)
      return streamReply()
    })
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  const playbackFails = async (code = 4, currentTime = 0) => {
    await waitFor(() => expect(video()).not.toBeNull())
    failPlayback(code, currentTime)
  }
  const resumeAtPosition = async () => {
    await waitFor(() => expect(video()).not.toBeNull())
    Object.defineProperty(video(), 'duration', { value: 600, configurable: true })
    fireEvent.loadedMetadata(video())
    return video().currentTime
  }

  it.each([
    [404, { code: 'MEDIA_FILE_MISSING' }, 'Le fichier de ce film est introuvable.'],
    [403, { code: 'ACCESS_DENIED' }, 'Vous n’avez pas les droits nécessaires pour cette action.'],
    [415, { code: 'MEDIA_UNSUPPORTED_FORMAT' }, 'Le format de cette vidéo n’est pas pris en charge.'],
  ])('le flux répond %s : message clair, sans nouveau ticket', async (status, body, message) => {
    streamReply = () => json(body, status)
    renderPlayer()
    await playbackFails()

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Lecture impossible' })).toBeInTheDocument()
    expect(callsTo(fetchMock, isTicket)).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Retour à la fiche' })).toBeInTheDocument()
  })

  it('ticket expiré (401) : nouveau ticket automatique, reprise à la même position', async () => {
    streamReply = () => json({ code: 'TICKET_EXPIRED' }, 401)
    renderPlayer()
    await playbackFails(4, 87)

    await waitFor(() => expect(callsTo(fetchMock, isTicket)).toHaveLength(2))
    expect(await resumeAtPosition()).toBe(87)
  })

  it('perte du réseau : message de connexion, puis « Réessayer » reprend à la même position', async () => {
    streamReply = () => {
      throw new TypeError('Failed to fetch')
    }
    renderPlayer()
    await playbackFails(2, 140)

    expect(await screen.findByText('Impossible de joindre le serveur. Vérifiez votre connexion.')).toBeInTheDocument()
    expect(callsTo(fetchMock, isTicket)).toHaveLength(1)

    streamReply = () => new Response(null, { status: 206 })
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await resumeAtPosition()).toBe(140)
  })

  it('fichier illisible malgré un flux correct : message sur le fichier endommagé', async () => {
    renderPlayer()
    await playbackFails(3)
    await waitFor(() => expect(callsTo(fetchMock, isTicket)).toHaveLength(2)) // un nouveau ticket d'abord
    await waitFor(() => expect(video()).not.toBeNull())
    failPlayback(3)

    expect(await screen.findByText('Cette vidéo ne peut pas être lue : le fichier semble endommagé.')).toBeInTheDocument()
  })

  it('n’affiche aucun détail technique du serveur', async () => {
    streamReply = () =>
      json({ code: 'MEDIA_FILE_MISSING', detail: 'java.io.FileNotFoundException: /media/film.mp4' }, 404)
    renderPlayer()
    await playbackFails()
    await screen.findByText('Le fichier de ce film est introuvable.')
    expect(document.body).not.toHaveTextContent(/FileNotFound|\/media\/film|java\./)
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

  it('reprend à la dernière position enregistrée du profil', async () => {
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

  it('ignore une position dans l’URL : un rechargement ne revient pas à un point dépassé', async () => {
    progress = { ...NOT_STARTED, positionSeconds: 312, state: 'STARTED' }
    renderPlayer('?t=40') // ancien lien ou historique du navigateur
    await loadVideo()
    expect(video().currentTime).toBe(312)
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
