// Revue XSS (#86) : l'application réelle affiche des charges malveillantes partout où un texte vient d'un utilisateur ou
// du serveur. Chaque charge doit apparaître telle quelle, comme du texte : aucun élément créé, aucun script exécuté.
import { act, screen, waitFor, within } from '@testing-library/react'
import { http } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { journey, openApp, server, setupJourneyHarness, user } from '@/journeys/harness'
import { problem } from '@/mocks/http'

setupJourneyHarness()

/** Charge propre à un champ : balises `<img onerror>` et `<script>`, et tentative de sortir d'un attribut. */
const payload = (field) =>
  `"><img src=x onerror="window.__xss='${field}'" data-xss="${field}"><script data-xss="${field}">window.__xss='${field}'</script>`

/** Aucune charge n'a été interprétée comme du HTML ou du script, nulle part dans le document. */
function expectInert() {
  expect(document.querySelector('[data-xss]')).toBeNull()
  expect(document.querySelector('[onerror], [onload], [onclick], [onmouseover], iframe, object, embed')).toBeNull()
  expect(document.querySelector('a[href^="javascript:" i]')?.getAttribute('href') ?? null).toBeNull()
  expect(document.body.querySelector('script')).toBeNull()
  expect(window.__xss).toBeUndefined()
}

/** Attend que la charge du champ soit affichée en toutes lettres, puis vérifie qu'elle est restée du texte. */
async function expectShownAsText(...fields) {
  for (const field of fields) {
    await waitFor(() => expect(document.body.textContent).toContain(payload(field)))
  }
  expectInert()
}

let ids

/** Empoisonne tout le texte de l'API simulée, puis ouvre une session d'administrateur avec un profil actif. */
beforeEach(() => {
  delete window.__xss
  const { db } = journey
  const [movie, other] = db.media
  Object.assign(movie, {
    title: payload('titre'),
    description: payload('description'),
    genres: [payload('genre')],
    posterUrl: payload('affiche'),
  })
  other.genres = [payload('genre')]
  db.genres = [payload('genre')]

  const admin = db.accounts.find((account) => account.role === 'ADMIN')
  Object.assign(admin, { username: payload('identifiant'), email: payload('courriel') })
  const [profile, second] = db.profiles
  profile.name = payload('profil')
  second.name = payload('autre-profil')
  db.favourites.get(profile.id).set(movie.id, '2026-11-20T10:00:00Z')
  db.progress.get(profile.id).set(movie.id, {
    mediaId: movie.id, positionSeconds: 60, durationSeconds: 600, state: 'STARTED', updatedAt: '2026-11-20T10:00:00Z',
  })

  Object.assign(db.roots[0], { label: payload('libelle'), path: `/media/${payload('chemin')}` })
  const [entry, active] = db.acquisition.catalogue
  Object.assign(entry, {
    title: payload('entree'), source: payload('source'), license: payload('licence'),
    licenseProofUrl: 'javascript:window.__xss="preuve"', inLibrary: false, libraryMediaId: null,
  })
  db.acquisition.downloads[0].title = payload('telechargement')

  db.session = { accountId: admin.id, activeProfileId: profile.id }
  ids = { movie: movie.id, profile: profile.id, active: active.id }
})

afterEach(() => delete window.__xss)

const go = async (router, path) => act(async () => router.navigate(path))
const closeDialog = (actor) => actor.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Fermer' }))

describe('texte contrôlé par l’utilisateur : rendu comme du texte, jamais comme du HTML', () => {
  it('accueil, catalogue, « Ma liste » et fiche : titre, description, genres', async () => {
    const { router } = openApp('/')
    await expectShownAsText('titre', 'genre', 'identifiant')

    await go(router, '/catalogue')
    await expectShownAsText('titre', 'genre')

    await go(router, '/ma-liste')
    await expectShownAsText('titre')

    await go(router, `/media/${ids.movie}`)
    await screen.findByRole('heading', { level: 1 })
    await expectShownAsText('titre', 'description', 'genre')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(payload('titre'))
  })

  it('recherche et filtre venant de l’adresse', async () => {
    openApp(`/catalogue?q=${encodeURIComponent(payload('recherche'))}&genre=${encodeURIComponent(payload('filtre'))}`)
    await expectShownAsText('recherche', 'filtre')
    expect(screen.getByRole('searchbox')).toHaveValue(payload('recherche'))
  })

  it('noms de profils : choix, gestion, renommage et suppression', async () => {
    const actor = user()
    const { router } = openApp('/profiles')
    await expectShownAsText('profil', 'autre-profil')

    await go(router, '/profiles/manage')
    await expectShownAsText('profil', 'autre-profil')
    await actor.click(screen.getAllByRole('button', { name: /^Renommer le profil/ })[0])
    expect(within(screen.getByRole('dialog')).getByRole('textbox')).toHaveValue(payload('profil'))
    expectInert()
    await closeDialog(actor)
    await actor.click(screen.getAllByRole('button', { name: /^Supprimer le profil/ })[0])
    expect(screen.getByRole('dialog').textContent).toContain(payload('profil'))
    expectInert()
  })

  it('message d’erreur de champ renvoyé par le serveur', async () => {
    server.use(
      http.post('*/api/identity/v1/profiles', () =>
        problem('validation-error', { errors: [{ field: 'name', message: payload('erreur') }] }),
      ),
    )
    const actor = user()
    openApp('/profiles/manage')
    await actor.click(await screen.findByRole('button', { name: 'Ajouter un profil' }))
    await actor.type(within(screen.getByRole('dialog')).getByRole('textbox'), 'Zoé')
    await actor.click(screen.getByRole('button', { name: 'Créer le profil' }))
    await expectShownAsText('erreur')
    expect(within(screen.getByRole('dialog')).getByRole('textbox')).toHaveAccessibleDescription(
      expect.stringContaining(payload('erreur')),
    )
  })

  it('mon compte et administration des comptes : identifiant et adresse', async () => {
    const { router } = openApp('/compte')
    await expectShownAsText('identifiant', 'courriel')

    await go(router, '/admin/comptes')
    await screen.findByRole('table')
    await expectShownAsText('identifiant', 'courriel')
    expect(screen.getByRole('cell', { name: payload('courriel') })).toBeInTheDocument()
  })

  it('administration de la bibliothèque : dossiers', async () => {
    const actor = user()
    openApp('/admin/bibliotheque')
    await expectShownAsText('libelle', 'chemin')
    await actor.click(screen.getByRole('button', { name: /^Retirer le dossier/ }))
    expect(screen.getByRole('dialog').textContent).toContain(payload('libelle'))
    expectInert()
  })

  it('administration des médias : tableau, formulaire de correction et retrait', async () => {
    const actor = user()
    openApp('/admin/medias')
    await screen.findByRole('table')
    await expectShownAsText('titre', 'genre')

    await actor.click(screen.getByRole('button', { name: `Modifier ${payload('titre')}` }))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByLabelText(/Titre/)).toHaveValue(payload('titre'))
    expect(dialog.getByLabelText(/Description/)).toHaveValue(payload('description'))
    expect(dialog.getByLabelText(/Genres/)).toHaveValue(payload('genre'))
    expectInert()
    await closeDialog(actor)
    await actor.click(screen.getByRole('button', { name: `Retirer ${payload('titre')} du catalogue` }))
    expect(screen.getByRole('dialog').textContent).toContain(payload('titre'))
    expectInert()
  })

  it('acquisition : catalogue, téléchargements, dialogues, et preuve de licence « javascript: » sans lien', async () => {
    const actor = user()
    openApp('/admin/acquisition')
    await expectShownAsText('entree', 'source', 'licence', 'telechargement')
    expect(screen.getByText('Preuve indisponible')).toBeInTheDocument()

    await actor.click(screen.getByRole('button', { name: `Télécharger ${payload('entree')}` }))
    expect(screen.getByRole('dialog').textContent).toContain(payload('entree'))
    expectInert()
    await closeDialog(actor)
    await actor.click(screen.getByRole('button', { name: `Annuler le téléchargement de ${payload('telechargement')}` }))
    expect(screen.getByRole('dialog').textContent).toContain(payload('telechargement'))
    expectInert()
  })
})
