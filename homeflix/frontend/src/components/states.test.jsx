import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RouteErrorPage from '@/app/RouteErrorPage'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import Skeleton from '@/components/Skeleton'

describe('EmptyState', () => {
  it('affiche le titre, la description et les actions', () => {
    render(
      <EmptyState title="Votre liste est vide" description="Ajoutez un programme depuis sa fiche.">
        <button type="button">Explorer le catalogue</button>
      </EmptyState>,
    )
    expect(screen.getByRole('heading', { name: 'Votre liste est vide' })).toBeInTheDocument()
    expect(screen.getByText('Ajoutez un programme depuis sa fiche.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Explorer le catalogue' })).toBeInTheDocument()
  })

  it('masque l’icône aux lecteurs d’écran', () => {
    const { container } = render(<EmptyState title="Vide" />)
    expect(container.querySelector('.state__icon')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('ErrorState', () => {
  it('est annoncé comme alerte avec un message en français par défaut', () => {
    render(<ErrorState />)
    expect(screen.getByRole('alert')).toHaveTextContent('Une erreur est survenue')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('« Réessayer » appelle onRetry', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(<ErrorState onRetry={onRetry} />)
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('accepte des actions supplémentaires', () => {
    render(
      <ErrorState title="Impossible de lire « Les horizons »">
        <button type="button">Retour à la fiche</button>
      </ErrorState>,
    )
    expect(screen.getByRole('button', { name: 'Retour à la fiche' })).toBeInTheDocument()
  })
})

describe('Skeleton', () => {
  it('est décoratif sans label', () => {
    render(<Skeleton lines={3} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('avec label : statut occupé annoncé', () => {
    render(<Skeleton label="Chargement du catalogue" />)
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(status).toHaveTextContent('Chargement du catalogue')
  })

  it('rend le nombre de lignes demandé', () => {
    const { container } = render(<Skeleton lines={3} />)
    expect(container.querySelectorAll('.skeleton')).toHaveLength(3)
  })
})

describe('RouteErrorPage', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))
  afterEach(() => vi.restoreAllMocks())

  it('affiche l’écran d’erreur quand une route plante, sans page blanche', () => {
    function Broken() {
      throw new Error('Détail technique secret')
    }
    const router = createMemoryRouter([
      { errorElement: <RouteErrorPage />, children: [{ path: '/', element: <Broken /> }] },
    ])
    render(<RouterProvider router={router} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Oups, quelque chose s’est mal passé')
    expect(screen.queryByText(/secret/)).not.toBeInTheDocument()
  })
})
