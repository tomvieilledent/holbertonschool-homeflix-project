import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import accountsFixture from '@fixtures/identity/accounts-page.json'
import AccountsPage from '@/features/admin/AccountsPage'
import { AuthContext } from '@/features/auth/authContext'

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const problem = (status, code, extra = {}) => json({ status, code, detail: 'java.lang.Secret', ...extra }, status)

const [ADMIN, FAMILLE, INVITE] = accountsFixture.items
const ME = ADMIN

let accounts // état de l'API simulée, modifié par les écritures
let fetchMock
let writes // [{ method, path, body }]
let failWith // réponse à renvoyer à la prochaine écriture, ou null

/** API Identity simulée : liste paginée (taille 20) et écritures sur `accounts`. */
function serve() {
  return async (url, init = {}) => {
    const path = String(url)
    const method = init.method ?? 'GET'
    const body = init.body ? JSON.parse(init.body) : undefined
    if (method === 'GET' && path.startsWith('/api/identity/v1/admin/accounts')) {
      const query = new URL(path, 'http://localhost').searchParams
      const page = Number(query.get('page') ?? 0)
      const size = Number(query.get('size') ?? 20)
      return json({
        items: accounts.slice(page * size, (page + 1) * size),
        page,
        size,
        total: accounts.length,
        totalPages: Math.ceil(accounts.length / size),
      })
    }
    writes.push({ method, path, body })
    if (failWith) {
      const response = failWith
      failWith = null
      return response
    }
    const id = path.split('/')[6]
    if (method === 'POST' && path.endsWith('/admin/accounts')) {
      const created = { id: `new-${accounts.length}`, enabled: true, mustChangePassword: true, createdAt: '2026-11-23T10:00:00Z', ...body }
      delete created.password
      accounts = [...accounts, created]
      return json(created, 201)
    }
    if (method === 'PATCH') {
      accounts = accounts.map((a) => (a.id === id ? { ...a, ...body } : a))
      return json(accounts.find((a) => a.id === id))
    }
    if (method === 'DELETE') {
      accounts = accounts.filter((a) => a.id !== id)
      return new Response(null, { status: 204 })
    }
    accounts = accounts.map((a) => (a.id === id ? { ...a, mustChangePassword: true } : a)) // password-reset
    return new Response(null, { status: 204 })
  }
}

function renderPage(url = '/admin/comptes') {
  const router = createMemoryRouter([{ path: '/admin/comptes', element: <AccountsPage /> }], { initialEntries: [url] })
  render(
    <AuthContext.Provider value={{ status: 'authenticated', account: ME }}>
      <RouterProvider router={router} />
    </AuthContext.Provider>,
  )
  return router
}

const rowOf = (username) => screen.getByRole('row', { name: new RegExp(`^${username}\\b`) })
const dialog = () => screen.getByRole('dialog')

describe('AccountsPage', () => {
  beforeEach(() => {
    accounts = structuredClone(accountsFixture.items)
    writes = []
    failWith = null
    fetchMock = vi.fn(serve())
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  describe('liste', () => {
    it('annonce le chargement puis affiche les comptes avec leur rôle et leur état', async () => {
      renderPage()
      expect(screen.getByRole('status')).toHaveTextContent('Chargement des comptes')

      expect(await screen.findByRole('table')).toBeInTheDocument()
      expect(screen.getByText('3 comptes')).toBeInTheDocument()
      expect(within(rowOf('famille')).getByText('Utilisateur')).toBeInTheDocument()
      expect(within(rowOf('famille')).getByText('Actif')).toBeInTheDocument()
      expect(within(rowOf('invite')).getByText(/Désactivé/)).toBeInTheDocument()
      expect(within(rowOf('invite')).getByText(/mot de passe temporaire/)).toBeInTheDocument()
      expect(fetchMock.mock.calls[0][0]).toBe('/api/identity/v1/admin/accounts?page=0&size=20')
    })

    it('propose de réessayer quand la liste ne se charge pas', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('network'))
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: 'Réessayer' }))
      expect(await screen.findByRole('table')).toBeInTheDocument()
    })

    it('affiche une erreur au lieu de planter si la réponse n’est pas une liste de comptes', async () => {
      fetchMock.mockResolvedValueOnce(json({ pas: 'une page' }))
      renderPage()
      expect(await screen.findByRole('button', { name: 'Réessayer' })).toBeInTheDocument()
      expect(screen.getByText('Réponse inattendue du serveur pour la liste des comptes.')).toBeInTheDocument()
    })

    it('repère son propre compte et le dernier administrateur, et bloque ce qui serait refusé', async () => {
      renderPage()
      await screen.findByRole('table')
      const row = rowOf('admin')
      expect(within(row).getByText(/\(vous\)/)).toBeInTheDocument()
      expect(within(row).getByText(/dernier administrateur/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Désactiver le compte admin' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Rétrograder en utilisateur le compte admin' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Supprimer le compte admin' })).toBeDisabled()
      expect(screen.getByText(/il doit toujours rester au moins un administrateur actif/)).toBeInTheDocument()
      // Les autres comptes restent gérables.
      expect(screen.getByRole('button', { name: 'Désactiver le compte famille' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Supprimer le compte famille' })).toBeEnabled()
    })

    it('pagine la liste, avec des liens, et ne devine pas le dernier administrateur', async () => {
      accounts = Array.from({ length: 25 }, (_, index) => ({
        ...FAMILLE,
        id: `u${index}`,
        username: `compte${String(index).padStart(2, '0')}`,
        email: `c${index}@maison.fr`,
      }))
      accounts[0] = { ...ADMIN }
      accounts[1] = { ...ADMIN, id: 'a2', username: 'second-admin', email: 'a2@maison.fr' }
      renderPage()
      await screen.findByRole('table')
      expect(screen.getByText('25 comptes')).toBeInTheDocument()
      expect(screen.getAllByRole('row')).toHaveLength(21) // en-tête + 20
      expect(screen.getByRole('link', { name: 'Page 2' })).toHaveAttribute('href', '/admin/comptes?page=2')
      expect(screen.queryByText(/dernier administrateur$/)).not.toBeInTheDocument()
      // Un autre administrateur est gérable ; seul son propre compte est protégé.
      expect(screen.getByRole('button', { name: 'Désactiver le compte second-admin' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Désactiver le compte admin' })).toBeDisabled()
    })

    it('demande la page indiquée dans l’URL et revient à la dernière page si elle n’existe plus', async () => {
      const router = renderPage('/admin/comptes?page=3')
      await waitFor(() => expect(router.state.location.search).toBe(''))
      expect(await screen.findByRole('table')).toBeInTheDocument()
      expect(fetchMock.mock.calls[0][0]).toBe('/api/identity/v1/admin/accounts?page=2&size=20')
    })
  })

  describe('création', () => {
    const open = async () => {
      renderPage()
      await screen.findByRole('table')
      await userEvent.click(screen.getByRole('button', { name: 'Créer un compte' }))
    }
    const fill = async ({ username, email, password, role }) => {
      const form = within(dialog())
      if (username !== undefined) await userEvent.type(form.getByRole('textbox', { name: /Identifiant/ }), username)
      if (email !== undefined) await userEvent.type(form.getByRole('textbox', { name: /Adresse e-mail/ }), email)
      if (password !== undefined) await userEvent.type(form.getByRole('textbox', { name: /Mot de passe/ }), password)
      if (role) await userEvent.selectOptions(form.getByRole('combobox', { name: 'Rôle' }), role)
    }
    const submit = () => userEvent.click(within(dialog()).getByRole('button', { name: 'Créer le compte' }))

    it('ouvre un formulaire accessible dont le premier champ a le focus', async () => {
      await open()
      expect(dialog()).toHaveAccessibleName('Créer un compte')
      expect(within(dialog()).getByRole('textbox', { name: /Identifiant/ })).toHaveFocus()
      expect(within(dialog()).getByRole('combobox', { name: 'Rôle' })).toHaveValue('USER')
    })

    it('signale chaque champ invalide sans appeler le serveur', async () => {
      await open()
      await fill({ username: 'ab', email: 'pas-un-mail', password: 'court' })
      await submit()

      const form = within(dialog())
      expect(form.getByText('L’identifiant doit contenir entre 3 et 40 caractères.')).toBeInTheDocument()
      expect(form.getByText('Saisissez une adresse e-mail valide.')).toBeInTheDocument()
      expect(form.getByText('Le mot de passe doit contenir au moins 12 caractères.')).toBeInTheDocument()
      expect(form.getByRole('textbox', { name: /Identifiant/ })).toBeInvalid()
      expect(writes).toHaveLength(0)
    })

    it('crée le compte, ferme la modale, annonce le résultat et recharge la liste', async () => {
      await open()
      await fill({ username: ' lea ', email: 'lea@maison.fr', password: 'un-mot-de-passe-long', role: 'ADMIN' })
      await submit()

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(writes[0]).toEqual({
        method: 'POST',
        path: '/api/identity/v1/admin/accounts',
        body: { username: 'lea', email: 'lea@maison.fr', password: 'un-mot-de-passe-long', role: 'ADMIN' },
      })
      expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Compte « lea » créé.')
      expect(await screen.findByText('4 comptes')).toBeInTheDocument()
      expect(within(rowOf('lea')).getByText('Administrateur')).toBeInTheDocument()
    })

    it('dit qu’un identifiant ou une adresse e-mail est déjà utilisé, et garde le formulaire', async () => {
      await open()
      failWith = problem(409, 'CONFLICT')
      await fill({ username: 'famille', email: 'x@maison.fr', password: 'un-mot-de-passe-long' })
      await submit()
      expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
        'Cet identifiant ou cette adresse e-mail est déjà utilisé.',
      )
      expect(within(dialog()).getByRole('textbox', { name: /Identifiant/ })).toHaveValue('famille')
    })

    it('affiche l’erreur de validation du serveur sous le champ concerné', async () => {
      await open()
      failWith = problem(400, 'VALIDATION_ERROR', { errors: [{ field: 'email', message: 'Adresse refusée par le serveur.' }] })
      await fill({ username: 'lea', email: 'lea@maison.fr', password: 'un-mot-de-passe-long' })
      await submit()
      expect(await within(dialog()).findByText('Adresse refusée par le serveur.')).toBeInTheDocument()
    })

    it('n’affiche jamais le détail technique d’une erreur du serveur', async () => {
      await open()
      failWith = problem(500, 'INTERNAL_ERROR')
      await fill({ username: 'lea', email: 'lea@maison.fr', password: 'un-mot-de-passe-long' })
      await submit()
      const alert = await within(dialog()).findByRole('alert')
      expect(alert).toHaveTextContent('Une erreur est survenue de notre côté.')
      expect(document.body).not.toHaveTextContent('java.lang.Secret')
    })

    it('se ferme avec Échap sans rien créer', async () => {
      await open()
      await userEvent.keyboard('{Escape}')
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(writes).toHaveLength(0)
    })
  })

  describe('activation et désactivation', () => {
    it('demande confirmation avant de désactiver, puis désactive', async () => {
      renderPage()
      await screen.findByRole('table')
      await userEvent.click(screen.getByRole('button', { name: 'Désactiver le compte famille' }))

      expect(dialog()).toHaveAccessibleName('Désactiver le compte « famille » ?')
      expect(within(dialog()).getByText(/sessions sont fermées immédiatement/)).toBeInTheDocument()
      expect(within(dialog()).getByRole('button', { name: 'Annuler' })).toHaveFocus()
      expect(writes).toHaveLength(0)

      await userEvent.click(within(dialog()).getByRole('button', { name: 'Désactiver le compte' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(writes[0]).toMatchObject({ method: 'PATCH', path: '/api/identity/v1/admin/accounts/' + FAMILLE.id, body: { enabled: false } })
      expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Compte « famille » désactivé.')
      await waitFor(() => expect(within(rowOf('famille')).getByText(/Désactivé/)).toBeInTheDocument())
    })

    it('« Annuler » ne désactive rien', async () => {
      renderPage()
      await screen.findByRole('table')
      await userEvent.click(screen.getByRole('button', { name: 'Désactiver le compte famille' }))
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Annuler' }))
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(writes).toHaveLength(0)
    })

    it('active un compte désactivé directement, sans confirmation', async () => {
      renderPage()
      await screen.findByRole('table')
      await userEvent.click(screen.getByRole('button', { name: 'Activer le compte invite' }))

      expect(screen.queryByRole('dialog')).toBeNull()
      await waitFor(() => expect(writes[0]).toMatchObject({ method: 'PATCH', body: { enabled: true } }))
      expect(await screen.findByText('Compte « invite » activé.')).toBeInTheDocument()
      await waitFor(() => expect(within(rowOf('invite')).getByText('Actif')).toBeInTheDocument())
    })

    it('affiche une erreur lisible si l’activation échoue', async () => {
      renderPage()
      await screen.findByRole('table')
      failWith = problem(404, 'NOT_FOUND')
      await userEvent.click(screen.getByRole('button', { name: 'Activer le compte invite' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('Cet élément est introuvable.')
    })
  })

  describe('rôle', () => {
    it('promeut un utilisateur après confirmation', async () => {
      renderPage()
      await screen.findByRole('table')
      await userEvent.click(screen.getByRole('button', { name: 'Promouvoir administrateur le compte famille' }))
      expect(dialog()).toHaveAccessibleName('Donner les droits d’administrateur à « famille » ?')

      await userEvent.click(within(dialog()).getByRole('button', { name: 'Promouvoir' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(writes[0]).toMatchObject({ method: 'PATCH', body: { role: 'ADMIN' } })
      expect(screen.getByRole('status', { name: '' })).toHaveTextContent('« famille » est maintenant administrateur.')
      await waitFor(() => expect(within(rowOf('famille')).getByText('Administrateur')).toBeInTheDocument())
    })

    it('rétrograde un administrateur après confirmation (il n’est plus le dernier)', async () => {
      accounts = accounts.map((a) => (a.id === FAMILLE.id ? { ...a, role: 'ADMIN' } : a))
      renderPage()
      await screen.findByRole('table')
      await userEvent.click(screen.getByRole('button', { name: 'Rétrograder en utilisateur le compte famille' }))
      expect(dialog()).toHaveAccessibleName('Retirer les droits d’administrateur de « famille » ?')
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Rétrograder' }))
      await waitFor(() => expect(writes[0]).toMatchObject({ body: { role: 'USER' } }))
    })
  })

  describe('dernier administrateur', () => {
    it('explique clairement le refus du serveur et garde la confirmation ouverte', async () => {
      // Plus d'une page : l'écran ne peut pas deviner le dernier administrateur, c'est le serveur qui refuse.
      accounts = Array.from({ length: 22 }, (_, index) => ({ ...FAMILLE, id: `u${index}`, username: `compte${index}`, email: `c${index}@maison.fr` }))
      accounts[0] = { ...ADMIN }
      accounts[1] = { ...ADMIN, id: 'a2', username: 'autre-admin', email: 'a2@maison.fr' }
      renderPage()
      await screen.findByRole('table')
      failWith = problem(409, 'LAST_ADMIN')
      await userEvent.click(screen.getByRole('button', { name: 'Désactiver le compte autre-admin' }))
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Désactiver le compte' }))

      expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Il doit toujours rester au moins un administrateur.')
      expect(dialog()).toBeInTheDocument()
    })
  })

  describe('réinitialisation du mot de passe', () => {
    const open = async () => {
      renderPage()
      await screen.findByRole('table')
      await userEvent.click(screen.getByRole('button', { name: 'Réinitialiser le mot de passe de famille' }))
    }

    it('exige 12 caractères sans appeler le serveur', async () => {
      await open()
      expect(dialog()).toHaveAccessibleName('Réinitialiser le mot de passe de « famille »')
      await userEvent.type(within(dialog()).getByRole('textbox', { name: /Mot de passe temporaire/ }), 'court')
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Réinitialiser' }))
      expect(within(dialog()).getByText('Le mot de passe doit contenir au moins 12 caractères.')).toBeInTheDocument()
      expect(writes).toHaveLength(0)
    })

    it('définit le mot de passe temporaire et annonce le résultat', async () => {
      await open()
      await userEvent.type(within(dialog()).getByRole('textbox', { name: /Mot de passe temporaire/ }), 'temporaire-12345')
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Réinitialiser' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(writes[0]).toEqual({
        method: 'POST',
        path: `/api/identity/v1/admin/accounts/${FAMILLE.id}/password-reset`,
        body: { temporaryPassword: 'temporaire-12345' },
      })
      expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Mot de passe de « famille » réinitialisé.')
      // Le serveur marque le compte : la liste rechargée le montre.
      await waitFor(() => expect(within(rowOf('famille')).getByText(/mot de passe temporaire/)).toBeInTheDocument())
    })

    it('affiche l’erreur du serveur sous le champ', async () => {
      await open()
      failWith = problem(400, 'VALIDATION_ERROR', { errors: [{ field: 'temporaryPassword', message: 'Mot de passe trop faible.' }] })
      await userEvent.type(within(dialog()).getByRole('textbox', { name: /Mot de passe temporaire/ }), 'temporaire-12345')
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Réinitialiser' }))
      expect(await within(dialog()).findByText('Mot de passe trop faible.')).toBeInTheDocument()
    })
  })

  describe('suppression', () => {
    it('prévient des conséquences, demande confirmation, puis supprime', async () => {
      renderPage()
      await screen.findByRole('table')
      await userEvent.click(screen.getByRole('button', { name: 'Supprimer le compte invite' }))

      expect(dialog()).toHaveAccessibleName('Supprimer le compte « invite » ?')
      expect(within(dialog()).getByText(/profils, ses favoris et sa progression de lecture seront supprimés définitivement/)).toBeInTheDocument()
      expect(within(dialog()).getByText(/fichiers médias ne sont jamais supprimés/)).toBeInTheDocument()
      expect(writes).toHaveLength(0)

      await userEvent.click(within(dialog()).getByRole('button', { name: 'Supprimer le compte' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(writes[0]).toMatchObject({ method: 'DELETE', path: `/api/identity/v1/admin/accounts/${INVITE.id}` })
      expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Compte « invite » supprimé.')
      expect(await screen.findByText('2 comptes')).toBeInTheDocument()
      expect(screen.queryByRole('row', { name: /^invite\b/ })).not.toBeInTheDocument()
    })

    it('n’affiche aucune erreur technique et garde la confirmation ouverte si le serveur refuse', async () => {
      renderPage()
      await screen.findByRole('table')
      failWith = problem(500, 'INTERNAL_ERROR')
      await userEvent.click(screen.getByRole('button', { name: 'Supprimer le compte invite' }))
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Supprimer le compte' }))
      expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Une erreur est survenue de notre côté.')
      expect(document.body).not.toHaveTextContent('java.lang.Secret')
      expect(screen.getByRole('row', { name: /^invite\b/ })).toBeInTheDocument()
    })
  })
})
