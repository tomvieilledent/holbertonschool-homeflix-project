// #103 : audit axe-core automatisé des pages et des dialogues principaux. jsdom ne calcule ni couleurs ni mise en page :
// les contrastes sont vérifiés par `npm run check:contrast` et par le test de bout en bout, dans un vrai navigateur.
import { screen, waitFor, within } from '@testing-library/react'
import axe from 'axe-core'
import { beforeEach, describe, expect, it } from 'vitest'
import { journey, openApp, setupJourneyHarness, user } from '@/journeys/harness'

setupJourneyHarness()

beforeEach(() => {
  const admin = journey.db.accounts.find((account) => account.role === 'ADMIN')
  journey.db.session = { accountId: admin.id, activeProfileId: journey.db.profiles[0].id }
})

/** Violations de la page, lisibles dans le message d'échec : règle, gravité et éléments en cause. */
async function violations() {
  const result = await axe.run(document, { rules: { 'color-contrast': { enabled: false } } })
  return result.violations.map(({ id, impact, nodes }) => ({ id, impact, elements: nodes.map((node) => node.html) }))
}

/** Attend la fin des chargements (indicateurs et silhouettes) avant de contrôler. */
const ready = async (level = 1) => {
  await screen.findAllByRole('heading', { level })
  await waitFor(() => expect(screen.queryByText(/^Chargement/)).not.toBeInTheDocument())
}

describe('axe : aucune violation', () => {
  beforeEach(() => {
    document.documentElement.lang = 'fr' // posé par index.html, absent de l'environnement de test
    document.title = 'Homeflix'
  })

  it.each([
    '/', '/catalogue', '/ma-liste', '/compte', '/profiles', '/profiles/manage', '/nulle-part', '/media/inconnu',
    '/admin/comptes', '/admin/bibliotheque', '/admin/medias', '/admin/acquisition', '/admin/services',
  ])('page %s', async (path) => {
    openApp(path)
    await ready()
    expect(await violations()).toEqual([])
  })

  it('fiche et lecteur', async () => {
    const [movie] = journey.db.media
    openApp(`/media/${movie.id}`)
    await screen.findByRole('heading', { level: 1, name: movie.title })
    expect(await violations()).toEqual([])
    await user().click(screen.getByRole('link', { name: /Lecture|Reprendre/ }))
    await waitFor(() => expect(document.querySelector('video')).not.toBeNull())
    expect(await violations()).toEqual([])
  })

  it('connexion, y compris avec un message d’erreur', async () => {
    journey.db.session = null
    const actor = user()
    openApp('/login')
    await actor.click(await screen.findByRole('button', { name: 'Se connecter' }))
    await screen.findByRole('alert')
    expect(await violations()).toEqual([])
  })

  it.each([
    ['/profiles/manage', 'Ajouter un profil'],
    ['/compte', 'Supprimer mon compte'],
    ['/admin/comptes', 'Créer un compte'],
    ['/admin/bibliotheque', 'Ajouter un dossier'],
  ])('dialogue de %s : « %s »', async (path, button) => {
    const actor = user()
    openApp(path)
    await ready()
    await actor.click(screen.getAllByRole('button', { name: button })[0])
    expect(within(screen.getByRole('dialog')).getAllByRole('button').length).toBeGreaterThan(0)
    expect(await violations()).toEqual([])
  })
})
