// Parcours critiques de l'utilisateur, de bout en bout dans l'application (routeur, session, pages), face à l'API
// simulée par MSW à partir des contrats. Chaque test décrit un comportement, pas une implémentation.
//
// Données de démonstration (docs/api/fixtures) : le compte `famille` (USER) et le compte `admin` (ADMIN) ont le même
// mot de passe ; trois profils : « Alice » (a une reprise de lecture et trois favoris), « Bruno » et « Enfants ».
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import {
  cardOf,
  chooseProfile,
  goTo,
  journey,
  loadVideo,
  openApp,
  openDetail,
  pauseAt,
  requestsTo,
  server,
  signIn,
  signInAs,
  switchProfile,
  setupJourneyHarness,
  user,
} from '@/journeys/harness'

setupJourneyHarness()

const FILM = 'Cosmos Laundromat' // disponible, sans progression ni favori pour aucun profil
const FILM_DURATION = 730
const CONTINUE_FILM = 'Elephants Dream' // dans « Continuer à regarder » d'Alice (212 s)
const FAVOURITES = ['Sintel', 'Tears of Steel', 'Spring'] // « Ma liste » d'Alice
const problem = (status, code) => HttpResponse.json({ status, code, detail: 'java.lang.NullPointerException' }, { status })

describe('connexion', () => {
  it('un visiteur est amené à se connecter, puis revient à la page demandée après avoir choisi son profil', async () => {
    const actor = user()
    openApp('/catalogue')
    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument()

    await signIn(actor)
    await chooseProfile(actor, 'Alice')
    expect(await screen.findByRole('heading', { level: 1, name: 'Catalogue' })).toBeInTheDocument()
  })

  it('un mot de passe incorrect est refusé avec un message qui ne dit pas si le compte existe', async () => {
    const actor = user()
    openApp('/')
    await signIn(actor, 'famille', 'mauvais-mot-de-passe')
    expect(await screen.findByText('Identifiant ou mot de passe incorrect.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Connexion' })).toBeInTheDocument()

    await actor.clear(screen.getByLabelText(/Identifiant/))
    await actor.clear(screen.getByLabelText(/Mot de passe/))
    await signIn(actor, 'inconnu', 'mauvais-mot-de-passe')
    // Même message pour un compte inconnu : rien ne révèle si l'identifiant existe.
    expect(await screen.findByText('Identifiant ou mot de passe incorrect.')).toBeInTheDocument()
  })

  it('la session survit à un rechargement : pas de nouvelle connexion, le profil est conservé', async () => {
    const actor = user()
    const first = openApp('/')
    await signInAs(actor)
    expect(await screen.findByRole('region', { name: 'Continuer à regarder' })).toBeInTheDocument()
    first.unmount()

    openApp('/') // le navigateur recharge la page
    expect(await screen.findByRole('region', { name: 'Continuer à regarder' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Connexion' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Qui regarde ?' })).not.toBeInTheDocument()
  })

  it('se déconnecter ramène à la connexion et ferme l’accès aux pages protégées', async () => {
    const actor = user()
    const { router } = openApp('/')
    await signInAs(actor)
    await screen.findByRole('region', { name: 'Continuer à regarder' })

    await actor.click(screen.getByRole('button', { name: /famille/ }))
    await actor.click(screen.getByRole('button', { name: 'Se déconnecter' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Continuer à regarder' })).not.toBeInTheDocument())
    await waitFor(() => expect(requestsTo(/POST .*\/auth\/logout/)).toHaveLength(1))

    // Plus de session : une page protégée renvoie vers la connexion, en gardant la destination.
    await router.navigate('/catalogue')
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(router.state.location.search).toBe('?next=%2Fcatalogue')
    expect(screen.queryByRole('heading', { level: 1, name: 'Catalogue' })).not.toBeInTheDocument()
  })

  it('« Qui regarde ? » permet de se déconnecter sans entrer dans un profil', async () => {
    const actor = user()
    const { router } = openApp('/catalogue')
    await signIn(actor)
    await screen.findByRole('heading', { name: 'Qui regarde ?' })

    await actor.click(screen.getByRole('button', { name: 'Se déconnecter' }))
    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument()
    // Comme depuis le menu du compte : `/login` sans la destination de la personne qui part.
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.search).toBe('')
    expect(requestsTo(/POST .*\/auth\/logout/)).toHaveLength(1)
    expect(requestsTo(/POST .*\/select/)).toHaveLength(0)

    // Une adresse protégée ramène ensuite à la connexion.
    await act(async () => router.navigate('/catalogue'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(screen.queryByRole('heading', { level: 1, name: 'Catalogue' })).not.toBeInTheDocument()
  })

  it('une session perdue en cours de route explique pourquoi on revient à la connexion', async () => {
    const actor = user()
    openApp('/')
    await signInAs(actor)
    await screen.findByRole('region', { name: 'Continuer à regarder' })

    journey.db.session = null // le serveur n'honore plus ni le jeton ni le rafraîchissement
    await goTo(actor, 'Catalogue')
    expect(await screen.findByRole('heading', { name: 'Session expirée' })).toBeInTheDocument()
    expect(screen.getByText(/Votre session a expiré/)).toBeInTheDocument()
  })
})

describe('garde de route', () => {
  it('un utilisateur ordinaire ne voit pas l’administration et reçoit « Accès refusé » par URL directe', async () => {
    const actor = user()
    const { router } = openApp('/')
    await signInAs(actor)
    await screen.findByRole('region', { name: 'Continuer à regarder' })
    expect(screen.queryByRole('link', { name: 'Administration' })).not.toBeInTheDocument()

    await router.navigate('/admin/comptes')
    expect(await screen.findByRole('heading', { name: 'Accès refusé' }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Comptes' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Retour à l’accueil' })).toHaveAttribute('href', '/')
  })

  it('un administrateur accède à l’administration depuis le lien de l’en-tête', async () => {
    const actor = user()
    const { router } = openApp('/')
    await signInAs(actor, { username: 'admin' })
    await actor.click(await screen.findByRole('link', { name: 'Administration' }))

    // La section d'administration est chargée à la demande : laisser le temps au premier chargement.
    // `/admin` redirige vers « Comptes » : on attend l'état final plutôt qu'un élément de passage.
    const slow = { timeout: 5000 }
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Administration' })).toBeInTheDocument(), slow)
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Comptes' })).toBeInTheDocument(), slow)
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument(), slow)
    expect(router.state.location.pathname).toBe('/admin/comptes')
  })

  it('sans profil choisi, aucune page du visionnage ne s’ouvre : on est renvoyé vers « Qui regarde ? »', async () => {
    const actor = user()
    openApp('/ma-liste')
    await signIn(actor)
    await chooseProfile(actor, 'Alice')
    expect(await screen.findByRole('heading', { level: 1, name: 'Ma liste' })).toBeInTheDocument()
  })
})

describe('sélection de profil', () => {
  it('chaque profil a ses propres données : reprise de lecture et « Ma liste »', async () => {
    const actor = user()
    openApp('/')
    await signInAs(actor, { profile: 'Alice' })
    const continueRow = await screen.findByRole('region', { name: 'Continuer à regarder' })
    expect(within(continueRow).getByRole('heading', { level: 3, name: CONTINUE_FILM })).toBeInTheDocument()
    expect(within(await screen.findByRole('region', { name: 'Ma liste' })).getAllByRole('listitem')).toHaveLength(
      FAVOURITES.length,
    )

    await switchProfile(actor, 'Bruno')
    await screen.findByRole('region', { name: 'Ajoutés récemment' })
    expect(screen.queryByRole('region', { name: 'Continuer à regarder' })).not.toBeInTheDocument()
    expect(await screen.findByText(/Votre liste est vide/)).toBeInTheDocument()

    await switchProfile(actor, 'Alice')
    expect(await screen.findByRole('region', { name: 'Continuer à regarder' })).toBeInTheDocument()
  })

  it('gérer les profils : en créer un, puis le choisir', async () => {
    const actor = user()
    openApp('/profiles')
    await signIn(actor)
    await actor.click(await screen.findByRole('link', { name: 'Gérer les profils' }))
    await actor.click(await screen.findByRole('button', { name: 'Ajouter un profil' }))
    await actor.type(screen.getByLabelText(/Nom du profil/), 'Zoé')
    await actor.click(screen.getByRole('button', { name: 'Créer le profil' }))
    expect(await screen.findByText('Profil « Zoé » créé.')).toBeInTheDocument()

    await actor.click(screen.getByRole('link', { name: 'Retour au choix du profil' }))
    await chooseProfile(actor, 'Zoé')
    expect(await screen.findByRole('region', { name: 'Ajoutés récemment' })).toBeInTheDocument()
  })
})

describe('lecteur et progression', () => {
  /** Du catalogue à la page de lecture d'un film. */
  async function startPlaying(actor, title = FILM) {
    await goTo(actor, 'Catalogue')
    await actor.type(await screen.findByLabelText('Rechercher un titre'), title.slice(0, 6))
    await screen.findByRole('heading', { level: 3, name: title })
    await openDetail(actor, title)
    await actor.click(await screen.findByRole('link', { name: 'Lecture' }))
    return loadVideo(FILM_DURATION)
  }

  it('on trouve un film, on le lit, on le met en pause, et on le reprend à la bonne position après un rechargement', async () => {
    const actor = user()
    const first = openApp('/')
    await signInAs(actor)
    const video = await startPlaying(actor)
    expect(requestsTo(/POST .*\/media\/.*\/stream-ticket/)).toHaveLength(1)
    expect(video.currentTime).toBe(0)

    pauseAt(video, 245)
    await waitFor(() => expect(requestsTo(/PUT .*\/progress/)).toHaveLength(1))
    first.unmount()

    const { router } = openApp(`/watch/${journey.db.media.find((m) => m.title === FILM).id}`)
    const resumed = await loadVideo(FILM_DURATION)
    expect(resumed.currentTime).toBe(245)

    // La fiche et l'accueil proposent maintenant de reprendre.
    await router.navigate(`/media/${journey.db.media.find((m) => m.title === FILM).id}`)
    expect(await screen.findByRole('link', { name: 'Reprendre à 4:05' })).toBeInTheDocument()
    expect(screen.getByLabelText('Progression de visionnage')).toBeInTheDocument()
    await router.navigate('/')
    const row = await screen.findByRole('region', { name: 'Continuer à regarder' })
    expect(within(row).getByRole('heading', { level: 3, name: FILM })).toBeInTheDocument()
  })

  it('la position est aussi enregistrée en quittant la page de lecture', async () => {
    const actor = user()
    openApp('/')
    await signInAs(actor)
    const video = await startPlaying(actor)
    video.currentTime = 90
    fireEvent.timeUpdate(video) // en lecture : rien n'est encore envoyé

    await actor.click(screen.getByRole('link', { name: 'Retour à la fiche' }))
    await waitFor(() => expect(requestsTo(/PUT .*\/progress/)).toHaveLength(1))
    expect(await screen.findByRole('link', { name: 'Reprendre à 1:30' })).toBeInTheDocument()
  })

  it('« Recommencer » efface la progression : la fiche propose de nouveau « Lecture »', async () => {
    const actor = user()
    openApp('/')
    await signInAs(actor)
    const video = await startPlaying(actor)
    pauseAt(video, 300)
    await waitFor(() => expect(requestsTo(/PUT .*\/progress/)).toHaveLength(1))

    await actor.click(screen.getByRole('button', { name: 'Recommencer' }))
    await waitFor(() => expect(requestsTo(/DELETE .*\/progress/)).toHaveLength(1))
    await actor.click(screen.getByRole('link', { name: 'Retour à la fiche' }))
    expect(await screen.findByRole('link', { name: 'Lecture' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Progression de visionnage')).not.toBeInTheDocument()
  })

  it('chaque profil a sa propre position de lecture', async () => {
    const actor = user()
    openApp('/')
    await signInAs(actor, { profile: 'Alice' })
    const video = await startPlaying(actor)
    pauseAt(video, 120)
    await waitFor(() => expect(requestsTo(/PUT .*\/progress/)).toHaveLength(1))

    await switchProfile(actor, 'Bruno')
    await goTo(actor, 'Catalogue')
    await actor.type(await screen.findByLabelText('Rechercher un titre'), 'Cosmos')
    await openDetail(actor, FILM)
    expect(await screen.findByRole('link', { name: 'Lecture' })).toBeInTheDocument() // Bruno n'a rien commencé

    await switchProfile(actor, 'Alice')
    await goTo(actor, 'Catalogue')
    await actor.type(await screen.findByLabelText('Rechercher un titre'), 'Cosmos')
    await openDetail(actor, FILM)
    expect(await screen.findByRole('link', { name: 'Reprendre à 2:00' })).toBeInTheDocument()
  })

  it('reprendre depuis « Continuer à regarder » démarre à la position enregistrée', async () => {
    const actor = user()
    openApp('/')
    await signInAs(actor)
    const row = await screen.findByRole('region', { name: 'Continuer à regarder' })
    await actor.click(within(row).getByRole('link', { name: new RegExp(CONTINUE_FILM) }))
    await actor.click(await screen.findByRole('link', { name: 'Reprendre à 3:32' }))

    const video = await loadVideo(FILM_DURATION)
    expect(video.currentTime).toBe(212)
  })
})

describe('favoris', () => {
  it('ajouter un film met à jour toutes les vues, le retirer aussi', async () => {
    const actor = user()
    openApp('/')
    await signInAs(actor)
    await goTo(actor, 'Catalogue')
    await actor.type(await screen.findByLabelText('Rechercher un titre'), 'Cosmos')
    await screen.findByRole('heading', { level: 3, name: FILM })
    const add = await within(cardOf(FILM)).findByRole('button', { name: new RegExp(`ajouter « ${FILM} »`) })
    expect(add).toHaveAttribute('aria-pressed', 'false')
    await actor.click(add)
    expect(within(cardOf(FILM)).getByRole('button', { name: new RegExp(`retirer « ${FILM} »`) })).toHaveAttribute(
      'aria-pressed',
      'true',
    ) // tout de suite, avant la réponse du serveur

    await goTo(actor, 'Ma liste')
    expect(await screen.findByText(`${FAVOURITES.length + 1} films dans votre liste`)).toBeInTheDocument()
    await openDetail(actor, FILM)
    expect(screen.getByRole('button', { name: 'Dans ma liste' })).toHaveAttribute('aria-pressed', 'true')

    await goTo(actor, 'Ma liste')
    await screen.findByText(`${FAVOURITES.length + 1} films dans votre liste`)
    await actor.click(within(cardOf(FILM)).getByRole('button', { name: new RegExp(`retirer « ${FILM} »`) }))
    expect(await screen.findByText(`${FAVOURITES.length} films dans votre liste`)).toBeInTheDocument()
    await goTo(actor, 'Catalogue')
    await actor.type(await screen.findByLabelText('Rechercher un titre'), 'Cosmos')
    expect(
      await within(cardOf(FILM)).findByRole('button', { name: new RegExp(`ajouter « ${FILM} »`) }),
    ).toHaveAttribute('aria-pressed', 'false')
  })

  it('les favoris sont propres à chaque profil', async () => {
    const actor = user()
    openApp('/')
    await signInAs(actor, { profile: 'Alice' })
    await goTo(actor, 'Ma liste')
    expect(await screen.findByText(`${FAVOURITES.length} films dans votre liste`)).toBeInTheDocument()

    await switchProfile(actor, 'Bruno')
    await goTo(actor, 'Ma liste')
    expect(await screen.findByRole('heading', { name: 'Votre liste est vide' })).toBeInTheDocument()
  })

  it('un refus du serveur restaure l’état précédent et l’explique sans détail technique', async () => {
    const actor = user()
    openApp('/')
    await signInAs(actor)
    await goTo(actor, 'Catalogue')
    await actor.type(await screen.findByLabelText('Rechercher un titre'), 'Cosmos')
    await screen.findByRole('heading', { level: 3, name: FILM })
    const add = await within(cardOf(FILM)).findByRole('button', { name: new RegExp(`ajouter « ${FILM} »`) })
    server.use(http.put('*/api/library/v1/me/favourites/:mediaId', () => problem(500, 'INTERNAL_ERROR')))

    await actor.click(add)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(`Impossible d’ajouter « ${FILM} » à votre liste.`)
    expect(document.body).not.toHaveTextContent('NullPointerException')
    expect(within(cardOf(FILM)).getByRole('button', { name: new RegExp(`ajouter « ${FILM} »`) })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })
})

describe('erreurs', () => {
  async function openPlayer(actor) {
    await goTo(actor, 'Catalogue')
    await actor.type(await screen.findByLabelText('Rechercher un titre'), 'Cosmos')
    await openDetail(actor, FILM)
    await actor.click(await screen.findByRole('link', { name: 'Lecture' }))
    return loadVideo(FILM_DURATION)
  }

  it('un fichier manquant est expliqué simplement, avec un retour vers la fiche', async () => {
    const actor = user()
    openApp('/')
    await signInAs(actor)
    const video = await openPlayer(actor)
    // Le flux simulé répond « fichier introuvable » (404) : la balise <video> échoue comme dans un navigateur.
    Object.defineProperty(video, 'error', { value: { code: 4 }, configurable: true })
    fireEvent.error(video)

    expect(await screen.findByRole('heading', { name: 'Lecture impossible' })).toBeInTheDocument()
    expect(screen.getByText('Le fichier de ce film est introuvable.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Retour à la fiche' })).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent('java.lang')
  })

  it('un ticket de lecture expiré est renouvelé sans que le spectateur ne perde sa place', async () => {
    const actor = user()
    openApp('/')
    await signInAs(actor)
    let streamCalls = 0
    server.use(
      http.get('*/api/library/v1/stream/:mediaId', () => {
        streamCalls += 1
        return streamCalls === 1 ? problem(401, 'TICKET_EXPIRED') : new HttpResponse(null, { status: 206 })
      }),
    )
    const video = await openPlayer(actor)
    video.currentTime = 77
    Object.defineProperty(video, 'error', { value: { code: 2 }, configurable: true })
    fireEvent.error(video)

    await waitFor(() => expect(requestsTo(/POST .*\/media\/.*\/stream-ticket/)).toHaveLength(2))
    const again = await loadVideo(FILM_DURATION)
    expect(again.currentTime).toBe(77)
    expect(screen.queryByRole('heading', { name: 'Lecture impossible' })).not.toBeInTheDocument()
  })

  it('un film indisponible n’offre pas de lecture et dit pourquoi', async () => {
    const actor = user()
    openApp('/')
    await signInAs(actor)
    await goTo(actor, 'Catalogue')
    await actor.type(await screen.findByLabelText('Rechercher un titre'), 'Coffee')
    await openDetail(actor, 'Coffee Run')
    expect(screen.queryByRole('link', { name: 'Lecture' })).not.toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent(/pas disponible/)
  })

  it('un catalogue injoignable propose de réessayer, puis s’affiche', async () => {
    const actor = user()
    openApp('/')
    await signInAs(actor)
    await screen.findByRole('region', { name: 'Continuer à regarder' })
    server.use(http.get('*/api/library/v1/media', () => problem(503, 'LIBRARY_UNAVAILABLE')))
    await goTo(actor, 'Catalogue')
    expect(await screen.findByText(/momentanément indisponible/)).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent('NullPointerException')

    server.resetHandlers(...journey.handlers) // le service est revenu
    await actor.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByRole('heading', { level: 3, name: FILM })).toBeInTheDocument()
  })
})
