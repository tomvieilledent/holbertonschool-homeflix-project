// #103 : titres d'onglet et suivi du focus clavier, sur l'application réelle face à l'API simulée.
import { act, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { journey, openApp, setupJourneyHarness, user } from '@/journeys/harness'

setupJourneyHarness()

/** Ouvre une session d'administrateur avec un profil actif. */
beforeEach(() => {
  const admin = journey.db.accounts.find((account) => account.role === 'ADMIN')
  const [profile] = journey.db.profiles
  journey.db.session = { accountId: admin.id, activeProfileId: profile.id }
  // « Ma liste » du profil : exactement les deux premiers films.
  const [first, second] = journey.db.media
  journey.db.favourites.set(profile.id, new Map([[first.id, '2026-11-20T10:00:00Z'], [second.id, '2026-11-19T10:00:00Z']]))
})

const main = () => screen.getByRole('main')
const navLink = (name) =>
  within(screen.getByRole('navigation', { name: 'Navigation principale' })).getByRole('link', { name })
const title = (expected) => waitFor(() => expect(document.title).toBe(expected))

describe('titre de l’onglet', () => {
  it('nomme chaque page, et le film sur sa fiche', async () => {
    const { router } = openApp('/')
    await title('Accueil — Homeflix')
    const [movie] = journey.db.media
    for (const [path, expected] of [
      ['/catalogue', 'Catalogue'],
      [`/media/${movie.id}`, movie.title],
      [`/watch/${movie.id}`, 'Lecture'],
      [`/media/${movie.id}`, movie.title],
      ['/ma-liste', 'Ma liste'],
      ['/compte', 'Mon compte'],
      ['/admin/medias', 'Médias · Administration'],
      ['/profiles', 'Qui regarde ?'],
      ['/nulle-part', 'Page introuvable'],
    ]) {
      await act(async () => router.navigate(path))
      await title(`${expected} — Homeflix`)
    }
    expect(router.state.location.pathname).toBe('/nulle-part')
  })

  it('dit « Accès refusé » à un compte sans le rôle', async () => {
    journey.db.session.accountId = journey.db.accounts.find((account) => account.role === 'USER' && account.enabled).id
    openApp('/admin/comptes')
    expect(await screen.findByRole('heading', { name: 'Accès refusé' })).toBeInTheDocument()
    await title('Accès refusé — Homeflix')
  })
})

describe('focus clavier', () => {
  it('reste sur le lien de navigation utilisé, qui est toujours là', async () => {
    const actor = user()
    openApp('/')
    await screen.findByRole('navigation', { name: 'Navigation principale' })
    navLink('Catalogue').focus()
    await actor.keyboard('{Enter}')
    await screen.findByRole('heading', { name: 'Catalogue' })
    expect(navLink('Catalogue')).toHaveFocus()
  })

  it('va au contenu principal quand l’élément activé disparaît avec sa page', async () => {
    const actor = user()
    openApp('/catalogue')
    const [movie] = journey.db.media
    const card = await screen.findByRole('link', { name: new RegExp(movie.title) })
    card.focus()
    await actor.keyboard('{Enter}')
    await screen.findByRole('heading', { level: 1, name: movie.title })
    expect(main()).toHaveFocus()
  })

  it('garde le focus sur « Ma liste » pendant et après la mise à jour', async () => {
    const actor = user()
    openApp(`/media/${journey.db.media[2].id}`)
    const button = await screen.findByRole('button', { name: 'Ajouter à ma liste' })
    button.focus()
    await actor.keyboard('{Enter}')
    await screen.findByRole('button', { name: 'Dans ma liste' })
    expect(screen.getByRole('button', { name: 'Dans ma liste' })).toHaveFocus()
  })

  it('passe à l’élément suivant quand l’élément activé est retiré de la page', async () => {
    const actor = user()
    openApp('/ma-liste')
    await screen.findByRole('heading', { name: 'Ma liste' })
    const buttons = () => screen.getAllByRole('button', { name: /retirer «/ })
    await waitFor(() => expect(buttons()).toHaveLength(2))
    const next = buttons()[1]
    buttons()[0].focus()
    await actor.keyboard('{Enter}')
    await waitFor(() => expect(buttons()).toHaveLength(1))
    await waitFor(() => expect(next).toHaveFocus())
  })

  it('passe l’intro au clavier sans que le focus se perde', async () => {
    journey.db.session = null
    sessionStorage.clear() // l'intro n'a pas encore été vue
    const actor = user()
    openApp('/login')
    const skip = await screen.findByRole('button', { name: 'Passer l’intro' })
    await waitFor(() => expect(skip).toHaveFocus())
    // Échap, comme le bouton : avec Entrée, la simulation renvoie la touche à l'élément suivant, pas un navigateur.
    await actor.keyboard('{Escape}')
    await screen.findByRole('heading', { name: 'Connexion' })
    // Le premier champ si la session est déjà vérifiée, sinon le contenu principal : jamais nulle part.
    expect(main()).toContainElement(document.activeElement)
  })

  it('ferme le menu du compte quand on le quitte avec la touche Tab', async () => {
    const actor = user()
    openApp('/')
    const toggle = await screen.findByRole('button', { name: /^admin/ })
    toggle.focus()
    await actor.keyboard('{Enter}')
    screen.getByRole('button', { name: 'Se déconnecter' }).focus()
    await actor.tab()
    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'false'))
  })
})
