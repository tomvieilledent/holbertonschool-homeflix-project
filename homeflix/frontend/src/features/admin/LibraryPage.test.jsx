import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import rootsFixture from '@fixtures/library/media-roots.json'
import AddRootModal, { validationMessage } from '@/features/admin/AddRootModal'
import LibraryPage from '@/features/admin/LibraryPage'

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const problem = (status, code) => json({ status, code, detail: 'java.nio.file.AccessDeniedException: /secret' }, status)

const REASONS = {
  ROOT_NOT_FOUND: 'Ce dossier est introuvable. Vérifiez le chemin et que le dossier est bien monté.',
  ROOT_NOT_READABLE: 'HomeFlix n’a pas le droit de lire ce dossier. Vérifiez ses permissions.',
  ROOT_NOT_A_DIRECTORY: 'Ce chemin est un fichier, pas un dossier.',
  ROOT_NOT_ALLOWED: 'Ce dossier n’est pas dans un emplacement autorisé : choisissez un dossier situé sous /media ou /downloads.',
  ROOT_OVERLAP: 'Ce dossier chevauche un dossier déjà configuré.',
}

let roots // état de l'API simulée
let fetchMock
let writes // [{ method, path, body }]
let validation // résultat de `POST /validate` : fonction (chemin) → réponse
let failWith // réponse à renvoyer à la prochaine écriture
let rootsResponse // remplace la réponse de la liste des dossiers (une fois), ou null

function serve() {
  return async (url, init = {}) => {
    const path = String(url)
    const method = init.method ?? 'GET'
    const body = init.body ? JSON.parse(init.body) : undefined
    if (method === 'GET' && path.endsWith('/admin/index/status')) {
      return json({ jobId: 'j1', state: 'IDLE', startedAt: null, finishedAt: null }) // panneau d'indexation (#94)
    }
    if (method === 'GET' && path.endsWith('/admin/media-roots')) {
      if (rootsResponse) {
        const response = rootsResponse
        rootsResponse = null
        return response
      }
      return json(roots)
    }
    if (method === 'POST' && path.endsWith('/admin/media-roots/validate')) {
      writes.push({ method, path, body })
      return validation(body.path)
    }
    writes.push({ method, path, body })
    if (failWith) {
      const response = failWith
      failWith = null
      return response
    }
    if (method === 'POST') {
      const created = { id: `r${roots.length + 1}`, path: body.path, label: body.label ?? body.path.split('/').pop(), enabled: true, createdAt: '2026-11-23T10:00:00Z' }
      roots = [...roots, created]
      return json(created, 201)
    }
    if (method === 'DELETE') {
      roots = roots.filter((root) => root.id !== path.split('/').pop())
      return new Response(null, { status: 204 })
    }
    throw new Error(`requête inattendue : ${method} ${path}`)
  }
}

const valid = () => json({ valid: true })
const invalid = (code) => json({ valid: false, code, message: 'Message technique du serveur : java.io.IOException' })

const dialog = () => screen.getByRole('dialog')
const pathField = () => within(dialog()).getByRole('textbox', { name: /Chemin du dossier/ })
const verify = () => userEvent.click(within(dialog()).getByRole('button', { name: 'Vérifier le dossier' }))
const addButton = () => within(dialog()).getByRole('button', { name: 'Ajouter le dossier' })

describe('LibraryPage', () => {
  beforeEach(() => {
    roots = structuredClone(rootsFixture)
    writes = []
    validation = () => valid()
    failWith = null
    rootsResponse = null
    fetchMock = vi.fn(serve())
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  const openAdd = async () => {
    render(<LibraryPage />)
    await screen.findByRole('list')
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un dossier' }))
  }

  describe('liste', () => {
    it('annonce le chargement puis liste les dossiers autorisés', async () => {
      render(<LibraryPage />)
      expect(screen.getByText('Chargement des dossiers')).toBeInTheDocument()

      expect(await screen.findByRole('heading', { level: 3, name: 'Dossiers médias' })).toBeInTheDocument()
      for (const root of rootsFixture) {
        expect(screen.getByText(root.label)).toBeInTheDocument()
        expect(screen.getByText(root.path)).toBeInTheDocument()
      }
      expect(screen.getByText(/ne lit que les dossiers listés ici/)).toBeInTheDocument()
    })

    it('explique comment commencer quand aucun dossier n’est configuré', async () => {
      roots = []
      render(<LibraryPage />)
      expect(await screen.findByRole('heading', { name: 'Aucun dossier configuré' })).toBeInTheDocument()
    })

    it('propose de réessayer quand la liste ne se charge pas, sans détail technique', async () => {
      rootsResponse = problem(500, 'INTERNAL_ERROR')
      render(<LibraryPage />)
      expect(await screen.findByText('Une erreur est survenue de notre côté. Réessayez dans un instant.')).toBeInTheDocument()
      expect(document.body).not.toHaveTextContent('AccessDeniedException')
      await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
      expect(await screen.findByRole('list')).toBeInTheDocument()
    })

    it('ne plante pas si la réponse n’est pas une liste', async () => {
      rootsResponse = json({ pas: 'une liste' })
      render(<LibraryPage />)
      expect(await screen.findByRole('button', { name: 'Réessayer' })).toBeInTheDocument()
    })
  })

  describe('ajout : vérifier avant d’enregistrer', () => {
    it('ouvre un formulaire accessible dont le premier champ a le focus, et n’autorise pas l’ajout sans vérification', async () => {
      await openAdd()
      expect(dialog()).toHaveAccessibleName('Ajouter un dossier')
      expect(pathField()).toHaveFocus()
      expect(within(dialog()).getByText(/Emplacements autorisés : \/media et \/downloads/)).toBeInTheDocument()
      expect(addButton()).toBeDisabled()
    })

    it('exige un chemin sans appeler le serveur', async () => {
      await openAdd()
      await verify()
      expect(within(dialog()).getByText('Indiquez le chemin du dossier.')).toBeInTheDocument()
      expect(pathField()).toBeInvalid()
      expect(writes).toHaveLength(0)
    })

    it('affiche le résultat de la vérification avant tout enregistrement, puis ajoute', async () => {
      await openAdd()
      await userEvent.type(pathField(), '/media/series')
      await verify()

      expect(await within(dialog()).findByText(/Ce dossier peut être ajouté/)).toBeInTheDocument()
      expect(writes).toEqual([{ method: 'POST', path: '/api/library/v1/admin/media-roots/validate', body: { path: '/media/series' } }])
      expect(addButton()).toBeEnabled()

      await userEvent.type(within(dialog()).getByRole('textbox', { name: /Libellé/ }), ' Mes films ')
      await userEvent.click(addButton())
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(writes[1]).toEqual({ method: 'POST', path: '/api/library/v1/admin/media-roots', body: { path: '/media/series', label: 'Mes films' } })
      expect(screen.getByText('Dossier « Mes films » ajouté.')).toBeInTheDocument()
      expect(await screen.findByText('/media/series')).toBeInTheDocument()
    })

    it.each(Object.entries(REASONS))('un dossier refusé (%s) est expliqué en langage clair, sans détail technique', async (code, message) => {
      validation = () => invalid(code)
      await openAdd()
      await userEvent.type(pathField(), '/media/probleme')
      await verify()

      expect(await within(dialog()).findByRole('alert')).toHaveTextContent(message)
      expect(document.body).not.toHaveTextContent('java.io.IOException')
      expect(addButton()).toBeDisabled()
    })

    it('modifier le chemin efface le résultat : il faut vérifier de nouveau avant d’ajouter', async () => {
      await openAdd()
      await userEvent.type(pathField(), '/media/series')
      await verify()
      await within(dialog()).findByText(/Ce dossier peut être ajouté/)
      expect(addButton()).toBeEnabled()

      await userEvent.type(pathField(), 'x')
      expect(within(dialog()).queryByText(/Ce dossier peut être ajouté/)).not.toBeInTheDocument()
      expect(addButton()).toBeDisabled()
    })

    it('Entrée vérifie d’abord, puis enregistre', async () => {
      await openAdd()
      await userEvent.type(pathField(), '/media/series{Enter}')
      await within(dialog()).findByText(/Ce dossier peut être ajouté/)
      expect(writes.map((write) => write.path)).toEqual(['/api/library/v1/admin/media-roots/validate']) // vérifié, pas enregistré

      await userEvent.type(pathField(), '{Enter}') // le chemin n'a pas changé : Entrée enregistre
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(writes.map((write) => write.path)).toEqual([
        '/api/library/v1/admin/media-roots/validate',
        '/api/library/v1/admin/media-roots',
      ])
    })

    it('signale une panne de la vérification et la garde réessayable', async () => {
      validation = () => problem(503, 'LIBRARY_UNAVAILABLE')
      await openAdd()
      await userEvent.type(pathField(), '/media/series')
      await verify()
      expect(await within(dialog()).findByRole('alert')).toHaveTextContent('La bibliothèque est momentanément indisponible.')
      expect(addButton()).toBeDisabled()
    })

    it('le serveur peut encore refuser à l’enregistrement (chevauchement) : message clair, la fenêtre reste ouverte', async () => {
      await openAdd()
      await userEvent.type(pathField(), '/media/series')
      await verify()
      await within(dialog()).findByText(/Ce dossier peut être ajouté/)
      failWith = problem(409, 'ROOT_OVERLAP')
      await userEvent.click(addButton())

      expect(await within(dialog()).findByRole('alert')).toHaveTextContent(REASONS.ROOT_OVERLAP)
      expect(document.body).not.toHaveTextContent('AccessDeniedException')
    })

    it('se ferme avec Échap sans rien enregistrer', async () => {
      await openAdd()
      await userEvent.type(pathField(), '/media/series')
      await userEvent.keyboard('{Escape}')
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(writes).toHaveLength(0)
    })
  })

  describe('retrait', () => {
    it('demande confirmation, explique les conséquences, puis retire', async () => {
      render(<LibraryPage />)
      await screen.findByRole('list')
      const [first] = rootsFixture
      await userEvent.click(screen.getByRole('button', { name: `Retirer le dossier ${first.label}` }))

      expect(dialog()).toHaveAccessibleName(`Retirer le dossier « ${first.label} » ?`)
      expect(within(dialog()).getByText(/deviendront indisponibles/)).toBeInTheDocument()
      // Rajouter le dossier retrouve ses films : l'écran le dit avant de confirmer.
      expect(within(dialog()).getByText(/une indexation retrouvera ses films/)).toBeInTheDocument()
      expect(within(dialog()).getByText(/Aucun fichier n’est supprimé/)).toBeInTheDocument()
      expect(within(dialog()).getByRole('button', { name: 'Annuler' })).toHaveFocus()
      expect(writes).toHaveLength(0)

      await userEvent.click(within(dialog()).getByRole('button', { name: 'Retirer le dossier' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(writes[0]).toMatchObject({ method: 'DELETE', path: `/api/library/v1/admin/media-roots/${first.id}` })
      expect(screen.getByText(`Dossier « ${first.label} » retiré.`)).toBeInTheDocument()
      await waitFor(() => expect(screen.queryByText(first.path)).not.toBeInTheDocument())
    })

    it('« Annuler » ne retire rien', async () => {
      render(<LibraryPage />)
      await screen.findByRole('list')
      await userEvent.click(screen.getByRole('button', { name: `Retirer le dossier ${rootsFixture[0].label}` }))
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Annuler' }))
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(writes).toHaveLength(0)
    })

    it('un échec est expliqué sans détail technique et garde la confirmation ouverte', async () => {
      render(<LibraryPage />)
      await screen.findByRole('list')
      failWith = problem(500, 'INTERNAL_ERROR')
      await userEvent.click(screen.getByRole('button', { name: `Retirer le dossier ${rootsFixture[0].label}` }))
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Retirer le dossier' }))
      expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Une erreur est survenue de notre côté.')
      expect(document.body).not.toHaveTextContent('AccessDeniedException')
    })
  })
})

describe('messages de validation d’un dossier', () => {
  it.each(Object.entries(REASONS))('%s : message en français, sans terme technique', (code, message) => {
    const shown = validationMessage({ code, message: 'java.io.IOException: /etc/passwd' })
    expect(shown).toBe(message)
    expect(shown).toMatch(/^[A-ZÉÀ]/)
    expect(shown).not.toMatch(/exception|java|stack|errno|\/etc|http \d|null|undefined/i)
  })

  it('retombe sur le message du serveur pour un code inconnu, puis sur un message neutre', () => {
    expect(validationMessage({ code: 'ROOT_NOUVEAU', message: 'Ce dossier est trop profond.' })).toBe('Ce dossier est trop profond.')
    expect(validationMessage({})).toBe('Ce dossier ne peut pas être utilisé.')
  })

  it('le composant refuse d’ajouter un chemin non vérifié (même avec Entrée)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ valid: false, code: 'ROOT_NOT_FOUND' })))
    const onSubmit = vi.fn()
    render(<AddRootModal onSubmit={onSubmit} onClose={() => {}} />)
    await userEvent.type(screen.getByRole('textbox', { name: /Chemin du dossier/ }), '/media/introuvable{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent(REASONS.ROOT_NOT_FOUND)
    expect(onSubmit).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
