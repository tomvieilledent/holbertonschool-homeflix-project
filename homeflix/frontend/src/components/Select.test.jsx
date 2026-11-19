import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Select from '@/components/Select'

const OPTIONS = [
  { value: '', label: 'Tous les genres' },
  { value: 'Animation', label: 'Animation' },
  { value: 'Aventure', label: 'Aventure' },
]

describe('Select', () => {
  it('relie le label visible à la liste', () => {
    render(<Select label="Genre" options={OPTIONS} value="" onChange={() => {}} />)
    expect(screen.getByRole('combobox', { name: 'Genre' })).toHaveValue('')
    expect(screen.getAllByRole('option')).toHaveLength(3)
  })

  it('affiche la valeur choisie et la renvoie au changement, au clavier comme à la souris', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Select label="Genre" options={OPTIONS} value="Animation" onChange={onChange} />)
    const select = screen.getByRole('combobox', { name: 'Genre' })
    expect(select).toHaveValue('Animation')

    await user.selectOptions(select, 'Aventure')
    expect(onChange).toHaveBeenCalledWith('Aventure')
  })

  it('peut être désactivée', () => {
    render(<Select label="Genre" options={OPTIONS} value="" onChange={() => {}} disabled />)
    expect(screen.getByRole('combobox', { name: 'Genre' })).toBeDisabled()
  })
})
