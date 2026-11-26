import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import DataTable from '@/components/DataTable'

const columns = [
  { key: 'title', header: 'Titre', rowHeader: true, render: (row) => row.title },
  { key: 'year', header: 'Année', className: 'col-year', render: (row) => row.year },
  { key: 'actions', header: 'Actions', render: (row) => row.active && <button type="button">Annuler</button> },
]
const rows = [
  { id: 'a', title: 'Sintel', year: 2010, active: true },
  { id: 'b', title: 'Nuit', year: 2014, active: false },
]

const renderTable = (props) => render(<DataTable caption="Films" columns={columns} rows={rows} {...props} />)

describe('DataTable', () => {
  it('nomme le tableau et ses colonnes, et fait de la colonne désignée l’en-tête de chaque ligne', () => {
    renderTable()
    const table = screen.getByRole('table', { name: 'Films' })
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Titre', 'Année', 'Actions'])
    expect(within(table).getAllByRole('rowheader').map((cell) => cell.textContent)).toEqual(['Sintel', 'Nuit'])
    expect(within(screen.getByRole('row', { name: /^Sintel/ })).getByRole('button', { name: 'Annuler' })).toBeInTheDocument()
  })

  it('rappelle le nom de la colonne sur chaque cellule, pour la version en fiches', () => {
    renderTable()
    const [year] = within(screen.getByRole('row', { name: /^Sintel/ })).getAllByRole('cell')
    expect(year).toHaveAttribute('data-label', 'Année')
    expect(year).toHaveClass('col-year')
    expect(screen.getByRole('rowheader', { name: 'Sintel' })).not.toHaveAttribute('data-label')
  })

  it('laisse vraiment vide une cellule sans contenu (masquée en version en fiches)', () => {
    renderTable()
    const cells = within(screen.getByRole('row', { name: /^Nuit/ })).getAllByRole('cell')
    expect(cells.at(-1)).toBeEmptyDOMElement()
  })

  it('transmet les attributs propres à une ligne', () => {
    renderTable({ rowProps: (row) => ({ 'data-state': row.active ? 'on' : 'off' }) })
    expect(screen.getByRole('row', { name: /^Nuit/ })).toHaveAttribute('data-state', 'off')
  })
})
