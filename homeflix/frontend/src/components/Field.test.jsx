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

  it('multiline : une zone de texte avec les mêmes label, aide et erreur', async () => {
    const user = userEvent.setup()
    render(<Field label="Description" multiline rows={4} hint="2000 caractères maximum." error="Trop longue." />)
    const area = screen.getByLabelText('Description')
    expect(area.tagName).toBe('TEXTAREA')
    expect(area).not.toHaveAttribute('type')
    expect(area).toHaveAttribute('rows', '4')
    expect(area).toHaveAccessibleDescription('2000 caractères maximum. Trop longue.')
    expect(area).toBeInvalid()
    await user.type(area, 'ligne 1{Enter}ligne 2')
    expect(area).toHaveValue('ligne 1\nligne 2')
  })
})
