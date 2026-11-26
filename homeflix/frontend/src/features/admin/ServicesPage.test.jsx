import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ServicesPage from '@/features/admin/ServicesPage'

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const report = (acquisition = 'UP', library = 'UP') => ({
  status: acquisition === 'UP' && library === 'UP' ? 'UP' : 'DEGRADED',
  checkedAt: '2026-11-23T12:00:00Z',
  services: [
    { name: 'identity', status: 'UP' },
    { name: 'library', status: library },
    { name: 'acquisition', status: acquisition },
  ],
})

let responses // réponses successives (la dernière se répète) ou fonctions
let calls

beforeEach(() => {
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      calls.push(String(url))
      const next = responses.length > 1 ? responses.shift() : responses[0]
      if (next instanceof Error) throw next
      return typeof next === 'function' ? next() : json(next)
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

const row = (name) => within(screen.getByRole('list', { name: 'Services' })).getByText(name, { exact: false }).closest('li')

describe('ServicesPage', () => {
  it('affiche l’état général et celui de chaque service, une fois chargé', async () => {
    responses = [report()]
    render(<ServicesPage />)
    expect(screen.getByRole('status')).toHaveTextContent('Chargement de l’état des services')
    expect(await screen.findByText(/État général/)).toHaveTextContent('Opérationnel')
    expect(within(screen.getByRole('list', { name: 'Services' })).getAllByRole('listitem')).toHaveLength(3)
    for (const name of ['Identity', 'Library', 'Acquisition']) expect(row(name)).toHaveTextContent('Opérationnel')
    expect(calls).toEqual(['/api/identity/v1/admin/system/status'])
  })

  it('signale un service hors service et un état général dégradé, par le texte et pas seulement la couleur', async () => {
    responses = [report('DOWN')]
    render(<ServicesPage />)
    expect(await screen.findByText(/État général/)).toHaveTextContent('Dégradé')
    expect(row('Acquisition')).toHaveTextContent('Hors service')
    expect(row('Library')).toHaveTextContent('Opérationnel')
  })

  it('« Actualiser » relève à nouveau l’état et affiche le nouveau résultat', async () => {
    responses = [report('DOWN'), report('UP')]
    const user = userEvent.setup()
    render(<ServicesPage />)
    await screen.findByText(/Dégradé/)
    await user.click(screen.getByRole('button', { name: 'Actualiser' }))
    await waitFor(() => expect(screen.getByText(/État général/)).toHaveTextContent('Opérationnel'))
    expect(row('Acquisition')).toHaveTextContent('Opérationnel')
    expect(calls).toHaveLength(2)
  })

  it('ne relève l’état qu’à l’ouverture et à la demande, sans interrogation périodique', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      responses = [report()]
      render(<ServicesPage />)
      await screen.findByText(/État général/)
      await vi.advanceTimersByTimeAsync(60_000)
      expect(calls).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('si Identity est injoignable, affiche une erreur avec « Réessayer » sans inventer l’état des autres services', async () => {
    responses = [() => json({ title: 'Service indisponible', status: 503 }, 503), report()]
    const user = userEvent.setup()
    render(<ServicesPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('État des services indisponible')
    expect(screen.queryByRole('list', { name: 'Services' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByText(/État général/)).toHaveTextContent('Opérationnel')
  })

  it('conserve le dernier relevé quand l’actualisation échoue', async () => {
    responses = [report('DOWN'), () => json({ title: 'Service indisponible', status: 503 }, 503)]
    const user = userEvent.setup()
    render(<ServicesPage />)
    await screen.findByText(/Dégradé/)
    await user.click(screen.getByRole('button', { name: 'Actualiser' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Actualisation impossible')
    expect(row('Acquisition')).toHaveTextContent('Hors service')
  })

  it('rejette une réponse sans liste de services plutôt que d’afficher un état vide', async () => {
    responses = [{ status: 'UP', checkedAt: '2026-11-23T12:00:00Z' }]
    render(<ServicesPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('État des services indisponible')
  })
})
