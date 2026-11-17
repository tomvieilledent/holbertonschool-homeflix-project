import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ErrorBoundary from '@/components/ErrorBoundary'

let shouldThrow = true

function Bomb() {
  if (shouldThrow) throw new Error('Détail technique secret: NullPointer at x.js:42')
  return <p>Contenu rétabli</p>
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    shouldThrow = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('affiche les enfants quand tout va bien', () => {
    shouldThrow = false
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Contenu rétabli')).toBeInTheDocument()
  })

  it('affiche l’écran d’erreur à la place d’une page blanche', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Oups, quelque chose s’est mal passé')
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Retour à l’accueil' })).toHaveAttribute('href', '/')
  })

  it('n’expose aucun détail technique à l’utilisateur', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    )
    expect(screen.queryByText(/NullPointer|x\.js|secret/)).not.toBeInTheDocument()
    expect(console.error).toHaveBeenCalled()
  })

  it('« Réessayer » réaffiche le contenu une fois le problème résolu', async () => {
    const user = userEvent.setup()
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    )
    shouldThrow = false
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(screen.getByText('Contenu rétabli')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('accepte un rendu de remplacement', () => {
    render(
      <ErrorBoundary fallback={() => <p>Plan B</p>}>
        <Bomb />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Plan B')).toBeInTheDocument()
  })
})
