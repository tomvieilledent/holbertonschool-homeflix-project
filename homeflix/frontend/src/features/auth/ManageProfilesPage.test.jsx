import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '@/features/auth/authContext'
import ManageProfilesPage from '@/features/auth/ManageProfilesPage'

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const profile = (id, name) => ({ id, name, avatar: 'avatar-1', createdAt: '2026-11-18T10:00:00Z' })
const CAMILLE = profile('p1', 'Camille')
const LEO = profile('p2', 'Léo')

let fetchMock
let forgetProfile

/** Rejoue `GET /profiles` avec la liste donnée ; `handler(method, url, body)` répond aux autres appels. */
function stubApi(list, handler = () => null) {
  fetchMock = vi.fn(async (url, init = {}) => {
    const method = init.method ?? 'GET'
    if (method === 'GET' && url.endsWith('/profiles')) return json(list)
    const body = init.body ? JSON.parse(init.body) : undefined
    return handler(method, url, body) ?? json({ code: 'INTERNAL_ERROR' }, 500)
  })
  vi.stubGlobal('fetch', fetchMock)
}

const callsWith = (method) => fetchMock.mock.calls.filter(([, init]) => (init?.method ?? 'GET') === method)

function renderPage({ activeProfileId = 'p1' } = {}) {
  forgetProfile = vi.fn()
  const router = createMemoryRouter([{ path: '/profiles/manage', element: <ManageProfilesPage /> }], {
    initialEntries: ['/profiles/manage'],
  })
  const value = {
    status: 'authenticated',
    account: { id: 'a', username: 'camille', role: 'USER' },
    activeProfileId,
    forgetProfile,
  }
  render(
    <AuthContext.Provider value={value}>
      <RouterProvider router={router} />
    </AuthContext.Provider>,
  )
}

const dialog = () => screen.getByRole('dialog')

describe('ManageProfilesPage', () => {
  beforeEach(() => stubApi([CAMILLE, LEO]))
  afterEach(() => vi.unstubAllGlobals())

  it('liste les profils avec leurs actions et explique la limite', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Gérer les profils' })).toBeInTheDocument()
    expect(screen.getByText('Camille', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('(profil actif)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Renommer le profil Léo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Supprimer le profil Léo' })).toBeEnabled()
    expect(screen.getByText('2 profils sur 5 (maximum par compte).')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Retour au choix du profil' })).toHaveAttribute('href', '/profiles')
  })

  it('propose de réessayer quand la liste ne se charge pas', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network'))
    renderPage()
    const retry = await screen.findByRole('button', { name: 'Réessayer' })
    await userEvent.click(retry)
    expect(await screen.findByRole('heading', { name: 'Gérer les profils' })).toBeInTheDocument()
  })

  describe('création', () => {
    it('crée un profil depuis un formulaire dont le champ a le focus', async () => {
      stubApi([CAMILLE, LEO], (method, url, body) =>
        method === 'POST' ? json(profile('p3', body.name), 201) : null,
      )
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: 'Ajouter un profil' }))

      expect(dialog()).toHaveAccessibleName('Ajouter un profil')
      const field = within(dialog()).getByRole('textbox', { name: /Nom du profil/ })
      expect(field).toHaveFocus()
      expect(within(dialog()).getByText('30 caractères maximum.')).toBeInTheDocument()

      await userEvent.type(field, '  Zoé ')
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Créer le profil' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(JSON.parse(callsWith('POST')[0][1].body)).toEqual({ name: 'Zoé', avatar: 'avatar-1' })
      expect(screen.getByText('Zoé')).toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('Profil « Zoé » créé.')
      expect(screen.getByText('3 profils sur 5 (maximum par compte).')).toBeInTheDocument()
    })

    it('exige un nom sans appeler le serveur', async () => {
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: 'Ajouter un profil' }))
      await userEvent.type(within(dialog()).getByRole('textbox', { name: /Nom du profil/ }), '   ')
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Créer le profil' }))

      const field = within(dialog()).getByRole('textbox', { name: /Nom du profil/ })
      expect(field).toBeInvalid()
      expect(within(dialog()).getByRole('alert')).toHaveTextContent('Le nom du profil est obligatoire.')
      expect(callsWith('POST')).toHaveLength(0)
    })

    it('limite le nom à 30 caractères', async () => {
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: 'Ajouter un profil' }))
      expect(within(dialog()).getByRole('textbox', { name: /Nom du profil/ })).toHaveAttribute('maxlength', '30')
    })

    it('dit qu’un nom est déjà utilisé et garde le formulaire ouvert', async () => {
      stubApi([CAMILLE, LEO], (method) => (method === 'POST' ? json({ code: 'CONFLICT' }, 409) : null))
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: 'Ajouter un profil' }))
      await userEvent.type(within(dialog()).getByRole('textbox', { name: /Nom du profil/ }), 'Léo')
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Créer le profil' }))

      expect(await within(dialog()).findByText('Un profil porte déjà ce nom dans ce compte.')).toBeInTheDocument()
      expect(within(dialog()).getByRole('textbox', { name: /Nom du profil/ })).toBeInvalid()
    })

    it('affiche l’erreur de validation du serveur sous le champ', async () => {
      stubApi([CAMILLE, LEO], (method) =>
        method === 'POST'
          ? json({ code: 'VALIDATION_ERROR', errors: [{ field: 'name', message: 'Nom invalide.' }] }, 400)
          : null,
      )
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: 'Ajouter un profil' }))
      await userEvent.type(within(dialog()).getByRole('textbox', { name: /Nom du profil/ }), 'Zoé')
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Créer le profil' }))
      expect(await within(dialog()).findByText('Nom invalide.')).toBeInTheDocument()
    })

    it('explique l’échec quand la limite est atteinte côté serveur', async () => {
      stubApi([CAMILLE, LEO], (method) => (method === 'POST' ? json({ code: 'PROFILE_LIMIT_REACHED' }, 409) : null))
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: 'Ajouter un profil' }))
      await userEvent.type(within(dialog()).getByRole('textbox', { name: /Nom du profil/ }), 'Zoé')
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Créer le profil' }))
      expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Le nombre maximal de profils est atteint.')
    })

    it('se ferme avec Échap sans rien créer', async () => {
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: 'Ajouter un profil' }))
      await userEvent.keyboard('{Escape}')
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(callsWith('POST')).toHaveLength(0)
    })
  })

  describe('limite de 5 profils', () => {
    const FIVE = ['p1', 'p2', 'p3', 'p4', 'p5'].map((id, index) => profile(id, `Profil ${index + 1}`))

    it('désactive l’ajout et explique pourquoi', async () => {
      stubApi(FIVE)
      renderPage()
      const add = await screen.findByRole('button', { name: 'Ajouter un profil' })
      expect(add).toBeDisabled()
      const explanation = 'Limite atteinte : 5 profils sur 5. Supprimez un profil pour en créer un autre.'
      expect(screen.getByText(explanation)).toBeInTheDocument()
      expect(add).toHaveAccessibleDescription(explanation)
    })
  })

  describe('renommage', () => {
    it('renomme un profil à partir de son nom actuel', async () => {
      stubApi([CAMILLE, LEO], (method, url, body) => (method === 'PATCH' ? json(profile('p2', body.name)) : null))
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: 'Renommer le profil Léo' }))

      expect(dialog()).toHaveAccessibleName('Renommer le profil')
      const field = within(dialog()).getByRole('textbox', { name: /Nom du profil/ })
      expect(field).toHaveValue('Léo')
      await userEvent.clear(field)
      await userEvent.type(field, 'Léonie')
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Enregistrer' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      const [url, init] = callsWith('PATCH')[0]
      expect(url).toBe('/api/identity/v1/profiles/p2')
      expect(JSON.parse(init.body)).toEqual({ name: 'Léonie' })
      expect(screen.getByText('Léonie')).toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('Profil renommé en « Léonie ».')
    })

    it('ne fait aucune requête si le nom n’a pas changé', async () => {
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: 'Renommer le profil Léo' }))
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Enregistrer' }))
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(callsWith('PATCH')).toHaveLength(0)
    })

    it('refuse un nom vide et un nom déjà pris', async () => {
      stubApi([CAMILLE, LEO], (method) => (method === 'PATCH' ? json({ code: 'CONFLICT' }, 409) : null))
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: 'Renommer le profil Léo' }))
      const field = within(dialog()).getByRole('textbox', { name: /Nom du profil/ })
      await userEvent.clear(field)
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Enregistrer' }))
      expect(within(dialog()).getByText('Le nom du profil est obligatoire.')).toBeInTheDocument()

      await userEvent.type(field, 'Camille')
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Enregistrer' }))
      expect(await within(dialog()).findByText('Un profil porte déjà ce nom dans ce compte.')).toBeInTheDocument()
    })
  })

  describe('suppression', () => {
    it('demande confirmation, prévient de la perte des favoris et de la progression, et part sur « Annuler »', async () => {
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: 'Supprimer le profil Léo' }))

      expect(dialog()).toHaveAccessibleName('Supprimer le profil « Léo » ?')
      expect(within(dialog()).getByText(/favoris et la progression de lecture de ce profil seront supprimés/)).toBeInTheDocument()
      expect(within(dialog()).getByRole('button', { name: 'Annuler' })).toHaveFocus()
      expect(callsWith('DELETE')).toHaveLength(0)

      await userEvent.click(within(dialog()).getByRole('button', { name: 'Annuler' }))
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(screen.getByText('Léo')).toBeInTheDocument()
      expect(callsWith('DELETE')).toHaveLength(0)
    })

    it('supprime le profil après confirmation', async () => {
      stubApi([CAMILLE, LEO], (method) => (method === 'DELETE' ? new Response(null, { status: 204 }) : null))
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: 'Supprimer le profil Léo' }))
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Supprimer le profil' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(callsWith('DELETE')[0][0]).toBe('/api/identity/v1/profiles/p2')
      expect(screen.queryByText('Léo')).toBeNull()
      expect(screen.getByRole('status')).toHaveTextContent('Profil « Léo » supprimé.')
      expect(forgetProfile).not.toHaveBeenCalled()
      // Un profil de moins : la limite et la liste sont à jour, et le dernier ne peut plus être supprimé.
      expect(screen.getByRole('button', { name: 'Supprimer le profil Camille' })).toBeDisabled()
    })

    it('oublie le profil actif quand c’est lui qui est supprimé', async () => {
      stubApi([CAMILLE, LEO], (method) => (method === 'DELETE' ? new Response(null, { status: 204 }) : null))
      renderPage({ activeProfileId: 'p1' })
      await userEvent.click(await screen.findByRole('button', { name: 'Supprimer le profil Camille' }))
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Supprimer le profil' }))

      await waitFor(() => expect(forgetProfile).toHaveBeenCalledWith('p1'))
      expect(screen.getByRole('status')).toHaveTextContent('Choisissez un autre profil pour continuer à regarder.')
    })

    it('affiche l’échec sans fermer la confirmation', async () => {
      stubApi([CAMILLE, LEO], (method) => (method === 'DELETE' ? json({ code: 'CONFLICT' }, 409) : null))
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: 'Supprimer le profil Léo' }))
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Supprimer le profil' }))
      expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Cette action n’est pas possible')
      expect(screen.getByText('Léo')).toBeInTheDocument()
    })

    it('ne laisse pas supprimer le dernier profil et dit pourquoi', async () => {
      stubApi([CAMILLE])
      renderPage()
      const remove = await screen.findByRole('button', { name: 'Supprimer le profil Camille' })
      expect(remove).toBeDisabled()
      const explanation = 'Un compte garde toujours au moins un profil : celui-ci ne peut pas être supprimé.'
      expect(screen.getByText(explanation)).toBeInTheDocument()
      expect(remove).toHaveAccessibleDescription(explanation)
      expect(screen.getByText('1 profil sur 5 (maximum par compte).')).toBeInTheDocument()
    })
  })
})
