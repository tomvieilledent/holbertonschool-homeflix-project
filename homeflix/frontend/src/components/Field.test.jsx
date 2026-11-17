import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import Field from '@/components/Field'

describe('Field', () => {
  it('relie le label visible à l’input', async () => {
    const user = userEvent.setup()
    render(<Field label="Adresse e-mail" type="email" />)
    const input = screen.getByLabelText('Adresse e-mail')
    await user.type(input, 'a@b.fr')
    expect(input).toHaveValue('a@b.fr')
    expect(input).toHaveAttribute('type', 'email')
  })

  it('affiche l’erreur, la lie au champ et l’annonce', () => {
    render(<Field label="Mot de passe" error="Trop court" hint="8 caractères minimum" />)
    const input = screen.getByLabelText('Mot de passe')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Trop court')
    expect(input).toHaveAccessibleDescription('8 caractères minimum Trop court')
  })

  it('sans erreur : pas d’aria-invalid ni d’alerte', () => {
    render(<Field label="Nom" />)
    expect(screen.getByLabelText('Nom')).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('gère disabled et required', () => {
    render(<Field label="Nom" required disabled />)
    const input = screen.getByLabelText(/Nom/)
    expect(input).toBeDisabled()
    expect(input).toBeRequired()
  })
})
