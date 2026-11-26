import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '@/features/auth/authContext'
import EmptyLibrary from '@/features/catalogue/EmptyLibrary'
import { setupStage } from '@/features/catalogue/setupStage'

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const ROOT = { id: 'r1', path: '/media', label: 'Films', enabled: true }

let roots
let job // état de la dernière indexation ; une `Error` simule une panne
let fetchMock

function renderAs(role) {
  render(
    <AuthContext.Provider value={{ account: { id: '1', username: 'camille', role } }}>
      <MemoryRouter>
        <EmptyLibrary />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

const steps = () =>
  within(screen.getByRole('list', { name: 'Étapes de configuration' }))
    .getAllByRole('listitem')
    .map((step) => step.textContent)

describe('EmptyLibrary', () => {
  beforeEach(() => {
    roots = []
    job = { state: 'IDLE' }
    fetchMock = vi.fn(async (url) => {
      if (job instanceof Error) throw job
      if (String(url).endsWith('/admin/media-roots')) return json(roots)
      if (String(url).endsWith('/admin/index/status')) return json(job)
      throw new Error(`requête inattendue : ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('donne à un utilisateur un message neutre, sans lien ni appel d’administration', () => {
    renderAs('USER')
    expect(screen.getByRole('heading', { name: 'Aucun film pour le moment' })).toBeInTheDocument()
    expect(screen.getByText(/dès que la bibliothèque sera prête/)).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(/administrateur|dossier|indexation/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sans dossier, guide l’administrateur vers la configuration, les deux étapes à faire', async () => {
    renderAs('ADMIN')
    expect(screen.getByRole('status')).toHaveTextContent('Vérification de la bibliothèque')
    expect(await screen.findByRole('heading', { name: 'Configurez votre bibliothèque' })).toBeInTheDocument()
    expect(steps()).toEqual(['Ajouter le dossier qui contient vos films à faire', 'Lancer l’indexation à faire'])
    expect(screen.getByRole('link', { name: 'Ajouter un dossier' })).toHaveAttribute('href', '/admin/bibliotheque')
  })

  it.each([
    ['IDLE', 'Lancez l’indexation', 'Ouvrir la bibliothèque', 'à faire'],
    ['RUNNING', 'Indexation en cours', 'Suivre l’indexation', 'à faire'],
    ['FAILED', 'L’indexation a échoué', 'Ouvrir la bibliothèque', 'à faire'],
    ['COMPLETED', 'Aucun film trouvé', 'Vérifier la bibliothèque', '✓ fait'],
  ])('avec un dossier et une indexation %s : « %s »', async (state, title, action, indexing) => {
    roots = [ROOT]
    job = { state }
    renderAs('ADMIN')
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument()
    expect(steps()).toEqual(['Ajouter le dossier qui contient vos films ✓ fait', `Lancer l’indexation ${indexing}`])
    expect(screen.getByRole('link', { name: action })).toHaveAttribute('href', '/admin/bibliotheque')
  })

  it('garde le lien vers la configuration si l’avancement est inconnu, sans inventer d’étapes', async () => {
    job = new TypeError('network')
    renderAs('ADMIN')
    expect(await screen.findByRole('heading', { name: 'Votre bibliothèque est vide' })).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ouvrir la bibliothèque' })).toHaveAttribute('href', '/admin/bibliotheque')
  })

  it('ne compte pas un dossier désactivé', () => {
    expect(setupStage([{ ...ROOT, enabled: false }], { state: 'COMPLETED' })).toBe('folder')
  })
})
