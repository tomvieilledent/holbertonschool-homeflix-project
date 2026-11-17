import { setupWorker } from 'msw/browser'
import { createMocks } from '@/mocks/handlers'

/** Démarre l'API simulée dans le navigateur (importé dynamiquement, uniquement en développement). */
export async function startMocking() {
  const { handlers } = createMocks()
  await setupWorker(...handlers).start({
    onUnhandledRequest: 'warn',
    serviceWorker: { url: '/mockServiceWorker.js' },
  })
  console.info('[mock] API simulée active (VITE_USE_MOCKS=true). Mot de passe de démonstration : mot-de-passe-12')
}
