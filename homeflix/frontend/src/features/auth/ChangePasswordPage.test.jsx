// Mot de passe temporaire (#223, #274) : l'application réelle face à l'API simulée, qui comme le vrai service refuse
// toute autre route tant que le mot de passe n'est pas changé.
import { screen, waitFor } from '@testing-library/react'
import { http } from 'msw'
import { describe, expect, it } from 'vitest'
import { journey, MOCK_PASSWORD, openApp, server, setupJourneyHarness, signIn, user } from '@/journeys/harness'
import { problem } from '@/mocks/http'

setupJourneyHarness()

const NEW_PASSWORD = 'un-nouveau-mot-de-passe'
const TITLE = 'Choisissez un nouveau mot de passe'
const account = () => journey.db.accounts.find((a) => a.username === 'famille')
const posted = () => journey.requests.filter((r) => r === 'POST /api/identity/v1/auth/change-password')
const adminReads = () => journey.requests.filter((r) => /\/api\/(library|acquisition)\/|\/profiles/.test(r))

/** Session déjà ouverte (rechargement de la page) avec un mot de passe temporaire. */
function temporarySession() {
  account().mustChangePassword = true
  journey.db.session = { accountId: account().id, activeProfileId: null }
}

async function fill(actor, { current = MOCK_PASSWORD, next = NEW_PASSWORD, confirmation = next } = {}) {
  await screen.findByRole('heading', { name: TITLE })
  if (current) await actor.type(screen.getByLabelText(/^Mot de passe temporaire/), current)
  if (next) await actor.type(screen.getByLabelText(/^Nouveau mot de passe/), next)
  if (confirmation) await actor.type(screen.getByLabelText(/^Confirmer/), confirmation)
  await actor.click(screen.getByRole('button', { name: 'Changer le mot de passe' }))
}

describe('mot de passe temporaire', () => {
  it('après la connexion, impose le changement puis reprend la destination demandée', async () => {
    account().mustChangePassword = true
    const actor = user()
    const { router } = openApp('/login?next=%2Fcompte')
    await signIn(actor, 'famille')

    await screen.findByRole('heading', { name: TITLE })
    expect(router.state.location.pathname).toBe('/nouveau-mot-de-passe')
    await fill(actor)

    expect(await screen.findByRole('heading', { name: 'Mon compte' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/compte')
    expect(account().mustChangePassword).toBe(false)
  })

  it.each(['/', '/catalogue', '/profiles', '/profiles/manage', '/compte', '/admin/comptes'])(
    'ramène à l’écran de changement depuis %s, sans appeler les autres routes',
    async (path) => {
      temporarySession()
      const { router } = openApp(path)
      await screen.findByRole('heading', { name: TITLE })
      expect(router.state.location.pathname).toBe('/nouveau-mot-de-passe')
      expect(adminReads()).toEqual([])
      expect(screen.queryByRole('navigation', { name: 'Navigation principale' })).not.toBeInTheDocument()
    },
  )

  it('envoie le mot de passe actuel et le nouveau, avec le jeton de la session', async () => {
    temporarySession()
    let sent
    server.use(
      http.post('*/api/identity/v1/auth/change-password', async ({ request }) => {
        sent = { body: await request.json(), authorization: request.headers.get('Authorization') }
        return problem('internal-error')
      }),
    )
    openApp('/')
    await fill(user())
    await screen.findByRole('alert')
    expect(sent.body).toEqual({ currentPassword: MOCK_PASSWORD, newPassword: NEW_PASSWORD })
    expect(sent.authorization).toMatch(/^Bearer /)
  })

  it.each([
    ['rien de saisi', { current: '', next: '', confirmation: '' }, /Saisissez le mot de passe temporaire/],
    ['trop court', { next: 'onze-lettre' }, /au moins 12 caractères/],
    ['identique', { next: MOCK_PASSWORD }, /doit être différent/],
    ['confirmation différente', { confirmation: 'autre-chose-de-long' }, /ne correspondent pas/],
  ])('refuse avant tout envoi : %s', async (_label, values, message) => {
    temporarySession()
    openApp('/')
    await fill(user(), values)
    expect(screen.getAllByRole('alert').map((alert) => alert.textContent).join(' ')).toMatch(message)
    expect(posted()).toEqual([])
  })

  it('signale un mot de passe temporaire erroné sur son champ, et laisse corriger', async () => {
    temporarySession()
    const actor = user()
    openApp('/')
    await fill(actor, { current: 'ce-n-est-pas-celui-la' })

    const field = screen.getByLabelText(/^Mot de passe temporaire/)
    await waitFor(() => expect(field).toHaveAccessibleDescription(/Le mot de passe actuel est incorrect/))
    expect(screen.getByRole('heading', { name: TITLE })).toBeInTheDocument()
    expect(account().mustChangePassword).toBe(true)
  })

  it('permet de se déconnecter', async () => {
    temporarySession()
    const actor = user()
    const { router } = openApp('/')
    await actor.click(await screen.findByRole('button', { name: 'Se déconnecter' }))

    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument()
    expect(router.state.location.search).toBe('')
    expect(journey.db.session).toBeNull()
  })

  it('n’est pas proposé à un compte sans mot de passe temporaire', async () => {
    journey.db.session = { accountId: account().id, activeProfileId: null }
    const { router } = openApp('/nouveau-mot-de-passe?next=%2Fnouveau-mot-de-passe')
    await waitFor(() => expect(router.state.location.pathname).not.toBe('/nouveau-mot-de-passe'))
    expect(screen.queryByRole('heading', { name: TITLE })).not.toBeInTheDocument()
  })
})
