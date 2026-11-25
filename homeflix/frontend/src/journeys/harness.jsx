// Banc d'essai des parcours critiques : l'application réelle (routeur, session, pages) face à l'API simulée par
// MSW à partir des contrats et des fixtures (`src/mocks`). Seul le réseau est simulé ; rien d'autre n'est remplacé.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupServer } from 'msw/node'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterAll, afterEach, beforeAll, beforeEach, expect } from 'vitest'
import { routes } from '@/app/router'
import AuthProvider from '@/features/auth/AuthProvider'
import { markIntroSeen } from '@/features/intro/introSeen'
import { MOCK_PASSWORD } from '@/mocks/db'
import { createMocks } from '@/mocks/handlers'
import { forgetProfile } from '@/services/activeProfile'
import { setAccessToken } from '@/services/api'

export { MOCK_PASSWORD }

export const server = setupServer()

/** Contexte d'un parcours : l'état de l'API simulée (`db`) et les requêtes émises (`requests`). */
export const journey = { db: null, handlers: [], requests: [] }

/**
 * À appeler une fois en tête du fichier de test : démarre le serveur MSW et repart d'une API et d'une session
 * vierges avant chaque test.
 */
export function setupJourneyHarness() {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterAll(() => server.close())
  beforeEach(() => {
    sessionStorage.clear()
    markIntroSeen() // l'intro du logo n'est pas un parcours critique
    forgetProfile()
    setAccessToken(null)
    const mocks = createMocks()
    journey.db = mocks.db
    journey.handlers = mocks.handlers
    journey.requests = []
    server.resetHandlers(...mocks.handlers)
    server.events.on('request:start', ({ request }) => {
      journey.requests.push(`${request.method} ${new URL(request.url).pathname}`)
    })
  })
  afterEach(() => {
    server.events.removeAllListeners()
  })
}

export const user = () => userEvent.setup()

/** Ouvre l'application à `path`, comme un navigateur qui charge cette adresse. */
export function openApp(path = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const view = render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  )
  return { router, ...view }
}

/** Se connecte depuis la page de connexion. */
export async function signIn(actor, username = 'famille', password = MOCK_PASSWORD) {
  await actor.type(await screen.findByLabelText(/Identifiant/), username)
  await actor.type(screen.getByLabelText(/Mot de passe/), password)
  await actor.click(screen.getByRole('button', { name: /Se connecter/ }))
}

/** Choisit un profil sur « Qui regarde ? ». */
export async function chooseProfile(actor, name) {
  await screen.findByRole('heading', { name: 'Qui regarde ?' })
  await actor.click(screen.getByRole('button', { name }))
}

/** Se connecte puis choisit un profil : l'utilisateur arrive à l'accueil, ou à la destination demandée. */
export async function signInAs(actor, { username = 'famille', profile = 'Alice' } = {}) {
  await signIn(actor, username)
  await chooseProfile(actor, profile)
}

/** Va à une page par la navigation de l'en-tête. */
export async function goTo(actor, name) {
  const navigation = await screen.findByRole('navigation', { name: 'Navigation principale' })
  await actor.click(within(navigation).getByRole('link', { name }))
}

/** Change de profil par le menu du compte. */
export async function switchProfile(actor, name, username = 'famille') {
  await actor.click(screen.getByRole('button', { name: new RegExp(username) }))
  await actor.click(screen.getByRole('link', { name: 'Changer de profil' }))
  await chooseProfile(actor, name)
}

/** Carte d'un film (accueil, catalogue, « Ma liste »). */
export const cardOf = (title) => screen.getByRole('heading', { level: 3, name: title }).closest('article')

/** Ouvre la fiche d'un film à partir d'une carte. */
export async function openDetail(actor, title) {
  await actor.click(within(cardOf(title)).getByRole('link', { name: new RegExp(title) }))
  await screen.findByRole('heading', { level: 1, name: title })
}

/**
 * Charge le film dans la balise `<video>` (jsdom ne lit pas de vidéo : on simule ses événements) et renvoie l'élément.
 * @param {number} duration Durée du film, en secondes.
 */
export async function loadVideo(duration) {
  const video = await waitFor(() => {
    const element = document.querySelector('video')
    expect(element).not.toBeNull()
    return element
  })
  Object.defineProperty(video, 'duration', { value: duration, configurable: true })
  fireEvent.loadedMetadata(video)
  return video
}

/** Le spectateur se déplace à `seconds` puis met en pause : la position est enregistrée tout de suite. */
export function pauseAt(video, seconds) {
  video.currentTime = seconds
  fireEvent.timeUpdate(video)
  fireEvent.pause(video)
}

export const requestsTo = (pattern) => journey.requests.filter((request) => pattern.test(request))
