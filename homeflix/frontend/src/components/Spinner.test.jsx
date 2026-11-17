import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Spinner from '@/components/Spinner'

describe('Spinner', () => {
  it('est annoncé comme statut avec un libellé par défaut', () => {
    render(<Spinner />)
    expect(screen.getByRole('status')).toHaveTextContent('Chargement…')
  })

  it('accepte un libellé personnalisé', () => {
    render(<Spinner label="Indexation en cours" />)
    expect(screen.getByRole('status')).toHaveTextContent('Indexation en cours')
  })
})
