import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import VideoPlayer from '@/features/player/VideoPlayer'

/** jsdom n'implémente pas la lecture : on simule play/pause et les propriétés dont dépend le lecteur. */
function mockMedia() {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function play() {
    Object.defineProperty(this, 'paused', { value: false, configurable: true })
    this.dispatchEvent(new Event('play'))
    return Promise.resolve()
  })
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function pause() {
    Object.defineProperty(this, 'paused', { value: true, configurable: true })
    this.dispatchEvent(new Event('pause'))
  })
}

const videoElement = () => document.querySelector('video')

/** Charge les métadonnées : durée connue, le lecteur sort de l'état « chargement ». */
function loaded(duration = 600) {
  const video = videoElement()
  Object.defineProperty(video, 'duration', { value: duration, configurable: true })
  fireEvent.loadedMetadata(video)
  fireEvent.canPlay(video)
  return video
}

const player = () => screen.getByRole('group', { name: 'Lecteur vidéo' })

describe('VideoPlayer', () => {
  beforeEach(mockMedia)
  afterEach(() => {
    vi.restoreAllMocks()
    delete document.fullscreenEnabled
    delete document.fullscreenElement
  })

  it('étiquette chaque contrôle', () => {
    document.fullscreenEnabled = true
    render(<VideoPlayer src="/flux?t=x" />)
    expect(screen.getByRole('button', { name: 'Lire' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Position dans la vidéo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Couper le son' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Volume' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Plein écran' })).toBeInTheDocument()
    expect(player()).toHaveAccessibleDescription(/espace ou K/)
  })

  it('charge le flux fourni et annonce le chargement', () => {
    render(<VideoPlayer src="/api/library/v1/stream/m1?t=abc" />)
    expect(videoElement()).toHaveAttribute('src', '/api/library/v1/stream/m1?t=abc')
    expect(screen.getByRole('status')).toHaveTextContent('Chargement de la vidéo')
    loaded()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('affiche la mise en mémoire tampon puis la retire', () => {
    render(<VideoPlayer src="/flux" />)
    const video = loaded()
    fireEvent.waiting(video)
    expect(screen.getByRole('status')).toHaveTextContent('Mise en mémoire tampon')
    fireEvent.playing(video)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('lit et met en pause avec le bouton, dont le nom suit l’état', async () => {
    const user = userEvent.setup()
    render(<VideoPlayer src="/flux" />)
    loaded()
    await user.click(screen.getByRole('button', { name: 'Lire' }))
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Mettre en pause' }))
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Lire' })).toBeInTheDocument()
  })

  it('Espace sur le bouton l’active une seule fois (pas de double bascule)', async () => {
    const user = userEvent.setup()
    render(<VideoPlayer src="/flux" />)
    loaded()
    await user.tab() // le lecteur
    await user.tab() // le bouton Lire
    expect(screen.getByRole('button', { name: 'Lire' })).toHaveFocus()
    await user.keyboard(' ')
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1)
  })

  it('Espace et K basculent la lecture quand le lecteur a le focus', async () => {
    const user = userEvent.setup()
    render(<VideoPlayer src="/flux" />)
    loaded()
    player().focus()
    await user.keyboard(' ')
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1)
    await user.keyboard('k')
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1)
  })

  it('recule et avance avec les flèches et J/L, sans sortir de la vidéo', async () => {
    const user = userEvent.setup()
    render(<VideoPlayer src="/flux" />)
    const video = loaded(600)
    player().focus()
    await user.keyboard('{ArrowRight}')
    expect(video.currentTime).toBe(5)
    await user.keyboard('l')
    expect(video.currentTime).toBe(15)
    await user.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}')
    expect(video.currentTime).toBe(0) // borné à 0
    await user.keyboard('j')
    expect(video.currentTime).toBe(0)
  })

  it('règle le volume avec les flèches haut et bas et coupe le son avec M', async () => {
    const user = userEvent.setup()
    render(<VideoPlayer src="/flux" />)
    const video = loaded()
    video.volume = 0.5
    player().focus()
    await user.keyboard('{ArrowUp}')
    expect(video.volume).toBeCloseTo(0.6)
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(video.volume).toBeCloseTo(0.4)

    await user.keyboard('m')
    expect(video.muted).toBe(true)
    expect(screen.getByRole('button', { name: 'Activer le son' })).toHaveAttribute('aria-pressed', 'true')
    await user.keyboard('m')
    expect(screen.getByRole('button', { name: 'Couper le son' })).toBeInTheDocument()
  })

  it('le curseur de position déplace la lecture et dit où l’on est', () => {
    render(<VideoPlayer src="/flux" />)
    const video = loaded(596)
    const slider = screen.getByRole('slider', { name: 'Position dans la vidéo' })
    fireEvent.change(slider, { target: { value: '125' } })
    expect(video.currentTime).toBe(125)
    expect(slider).toHaveAttribute('aria-valuetext', '2 minutes 5 secondes sur 9 minutes 56 secondes')
    expect(screen.getByText('2:05 / 9:56')).toBeInTheDocument()
  })

  it('désactive le curseur de position tant que la durée est inconnue', () => {
    render(<VideoPlayer src="/flux" />)
    expect(screen.getByRole('slider', { name: 'Position dans la vidéo' })).toBeDisabled()
  })

  it('reprend à la position demandée (nouveau ticket)', () => {
    render(<VideoPlayer src="/flux" startAt={42} />)
    expect(loaded().currentTime).toBe(42)
  })

  it('bascule le plein écran du lecteur au bouton et à F', async () => {
    const user = userEvent.setup()
    document.fullscreenEnabled = true
    render(<VideoPlayer src="/flux" />)
    const request = vi.fn(() => Promise.resolve())
    player().requestFullscreen = request

    await user.click(screen.getByRole('button', { name: 'Plein écran' }))
    expect(request).toHaveBeenCalledTimes(1)

    player().focus()
    await user.keyboard('f')
    expect(request).toHaveBeenCalledTimes(2)

    document.fullscreenElement = player()
    fireEvent(document, new Event('fullscreenchange'))
    expect(screen.getByRole('button', { name: 'Quitter le plein écran' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('masque le plein écran quand le navigateur ne le permet pas', () => {
    render(<VideoPlayer src="/flux" />)
    expect(screen.queryByRole('button', { name: 'Plein écran' })).not.toBeInTheDocument()
  })

  it('signale une erreur de lecture avec la position courante', () => {
    const onError = vi.fn()
    render(<VideoPlayer src="/flux" onError={onError} />)
    const video = loaded()
    video.currentTime = 33
    Object.defineProperty(video, 'error', { value: { code: 4 }, configurable: true })
    fireEvent.error(video)
    expect(onError).toHaveBeenCalledWith({ code: 4 }, 33)
  })
})
