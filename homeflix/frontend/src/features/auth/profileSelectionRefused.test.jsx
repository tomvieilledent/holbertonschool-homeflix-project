// `POST /profiles/{id}/select` peut refuser parce que la session est finie ou le compte désactivé (#286) : l'application
// doit renvoyer à la connexion en disant pourquoi, pas laisser l'utilisateur sur « Qui regarde ? ».
import { screen } from '@testing-library/react'
import { http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { journey, openApp, server, setupJourneyHarness, user } from '@/journeys/harness'
import { problem } from '@/mocks/http'

setupJourneyHarness()

const SELECT = '*/api/identity/v1/profiles/:profileId/select'

describe('sélection d’un profil refusée', () => {
  beforeEach(() => {
    journey.db.session = { accountId: journey.db.accounts[0].id, activeProfileId: null }
  })

  const choose = async () => {
    const actor = user()
    const app = openApp('/profiles')
    await actor.click(await screen.findByRole('button', { name: journey.db.profiles[0].name }))
    return app
  }

  it('compte désactivé : retour à la connexion avec l’explication', async () => {
    server.use(http.post(SELECT, () => problem('account-disabled')))
    const { router } = await choose()

    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Ce compte est désactivé. Contactez l’administrateur.')
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.search).toBe('')
  })

  it('session révoquée : écran de session expirée', async () => {
    // La session est fermée côté serveur : la sélection puis le refresh sont refusés.
    server.use(
      http.post(SELECT, () => {
        journey.db.session = null
        return problem('session-expired')
      }),
    )
    const { router } = await choose()

    expect(await screen.findByRole('button', { name: /reconnecter/i })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })
})
