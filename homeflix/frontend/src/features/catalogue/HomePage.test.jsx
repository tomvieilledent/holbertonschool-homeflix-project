import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import home from '@fixtures/library/home.json'
import homeEmpty from '@fixtures/library/home-empty.json'
import HomePage from '@/features/catalogue/HomePage'

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const renderHome = () =>
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  )

const row = (name) => screen.getByRole('region', { name })

describe('HomePage', () => {
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn(async () => json(home))
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('affiche un chargement annoncé puis les quatre sections', async () => {
    renderHome()
    expect(screen.getByRole('status')).toHaveTextContent('Chargement de l’accueil')

    expect(await screen.findByRole('region', { name: 'Continuer à regarder' })).toBeInTheDocument()
    expect(row('Ajoutés récemment')).toBeInTheDocument()
    for (const category of home.categories) expect(row(category.genre)).toBeInTheDocument()
    expect(row('Ma liste')).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/library/v1/home')
  })

  it('remplit chaque rangée avec les films de la réponse', async () => {
    renderHome()
    await screen.findByRole('region', { name: 'Continuer à regarder' })
    expect(within(row('Continuer à regarder')).getAllByRole('listitem')).toHaveLength(home.continueWatching.length)
    expect(within(row('Ajoutés récemment')).getAllByRole('listitem')).toHaveLength(home.recentlyAdded.length)
    expect(within(row('Ma liste')).getAllByRole('listitem')).toHaveLength(home.favourites.length)
  })

  it('montre la progression sur « Continuer à regarder » seulement', async () => {
    renderHome()
    await screen.findByRole('region', { name: 'Continuer à regarder' })
    expect(within(row('Continuer à regarder')).getAllByRole('progressbar')).toHaveLength(home.continueWatching.length)
    expect(within(row('Ajoutés récemment')).queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('invite à demander à l’administrateur quand la bibliothèque est vide', async () => {
    fetchMock.mockImplementation(async () => json(homeEmpty))
    renderHome()
    expect(await screen.findByRole('heading', { name: 'Votre bibliothèque est vide' })).toBeInTheDocument()
    expect(screen.getByText(/Demandez à l’administrateur/)).toBeInTheDocument()
  })

  it('masque les rangées vides et explique « Ma liste » vide', async () => {
    fetchMock.mockImplementation(async () =>
      json({ ...homeEmpty, recentlyAdded: home.recentlyAdded }),
    )
    renderHome()
    await screen.findByRole('region', { name: 'Ajoutés récemment' })
    expect(screen.queryByRole('region', { name: 'Continuer à regarder' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Animation' })).not.toBeInTheDocument()
    expect(screen.getByText(/Votre liste est vide/)).toBeInTheDocument()
  })

  it('propose de réessayer quand le chargement échoue', async () => {
    const user = userEvent.setup()
    fetchMock.mockRejectedValueOnce(new TypeError('network'))
    renderHome()
    await user.click(await screen.findByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByRole('region', { name: 'Ma liste' })).toBeInTheDocument()
  })

  it('retire un film de « Ma liste » via DELETE', async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation(async (url, init) =>
      init?.method === 'DELETE' ? new Response(null, { status: 204 }) : json(home),
    )
    renderHome()
    const list = await screen.findByRole('region', { name: 'Ma liste' })
    const first = home.favourites[0]
    await user.click(within(list).getByRole('button', { name: new RegExp(`retirer « ${first.title} »`) }))

    await waitFor(() =>
      expect(within(row('Ma liste')).getAllByRole('listitem')).toHaveLength(home.favourites.length - 1),
    )
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'DELETE')
    expect(call[0]).toBe(`/api/library/v1/me/favourites/${first.id}`)
  })

  it('ajoute un film à « Ma liste » via PUT', async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation(async (url, init) =>
      init?.method === 'PUT' ? new Response(null, { status: 204 }) : json(home),
    )
    renderHome()
    const recent = await screen.findByRole('region', { name: 'Ajoutés récemment' })
    const candidate = home.recentlyAdded.find((m) => !home.favourites.some((f) => f.id === m.id))
    await user.click(within(recent).getByRole('button', { name: new RegExp(`ajouter « ${candidate.title} »`) }))

    await waitFor(() =>
      expect(within(row('Ma liste')).getAllByRole('listitem')).toHaveLength(home.favourites.length + 1),
    )
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true)
  })
})
