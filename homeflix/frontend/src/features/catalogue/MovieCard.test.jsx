import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { formatDuration } from '@/features/catalogue/format'
import MovieCard from '@/features/catalogue/MovieCard'

const MEDIA = {
  id: 'm1',
  title: 'Big Buck Bunny',
  posterUrl: null,
  genres: ['Animation', 'Comédie'],
  durationSeconds: 596,
  availability: 'AVAILABLE',
}

function renderCard(props = {}, media = {}) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <MovieCard media={{ ...MEDIA, ...media }} {...props} /> },
      { path: '/media/:mediaId', element: <p>fiche du film</p> },
    ],
    { initialEntries: ['/'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('MovieCard', () => {
  it.each([
    ['AVAILABLE', 'Disponible'],
    ['UNAVAILABLE', 'Indisponible'],
    ['DOWNLOADING', 'En téléchargement'],
  ])('affiche le badge textuel pour %s', (availability, label) => {
    renderCard({}, { availability })
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('affiche titre, genre et durée', () => {
    renderCard()
    expect(screen.getByRole('heading', { name: 'Big Buck Bunny' })).toBeInTheDocument()
    expect(screen.getByText('Animation · 10 min')).toBeInTheDocument()
  })

  it('utilise un placeholder sans image quand il n’y a pas d’affiche', () => {
    renderCard()
    expect(document.querySelector('img')).toBeNull()
  })

  it('affiche l’affiche quand elle existe', () => {
    renderCard({}, { posterUrl: '/poster.jpg' })
    expect(document.querySelector('img')).toHaveAttribute('src', '/poster.jpg')
  })

  it('rend le titre comme du texte, jamais comme du HTML', () => {
    renderCard({}, { title: '<img src=x onerror=alert(1)> <b>gras</b>' })
    expect(screen.getByRole('heading').textContent).toBe('<img src=x onerror=alert(1)> <b>gras</b>')
    expect(document.querySelector('img')).toBeNull()
    expect(document.querySelector('b')).toBeNull()
  })

  it('est focalisable et s’active au clavier', async () => {
    const user = userEvent.setup()
    const router = renderCard()
    await user.tab()
    expect(screen.getByRole('link', { name: /Big Buck Bunny/ })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(router.state.location.pathname).toBe('/media/m1')
  })

  it('bascule « Ma liste » sans ouvrir la fiche', async () => {
    const user = userEvent.setup()
    const onToggleFavourite = vi.fn()
    const router = renderCard({ onToggleFavourite })
    const button = screen.getByRole('button', { name: /Ma liste/ })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    await user.click(button)
    expect(onToggleFavourite).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }))
    expect(router.state.location.pathname).toBe('/')
  })

  it('indique l’état « dans ma liste »', () => {
    renderCard({ isFavourite: true, onToggleFavourite: vi.fn() })
    expect(screen.getByRole('button', { name: /Dans ma liste/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('n’affiche pas le bouton sans gestionnaire', () => {
    renderCard()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('formatDuration', () => {
  it.each([
    [596, '10 min'],
    [5400, '1 h 30'],
    [7200, '2 h'],
    [3900, '1 h 05'],
    [null, ''],
    [0, ''],
  ])('%s s → « %s »', (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text)
  })
})
