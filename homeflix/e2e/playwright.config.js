import { defineConfig, devices } from '@playwright/test'

// Les tests tournent contre une pile HomeFlix déjà démarrée (voir README.md) : par défaut http://localhost:8080.
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:8080'

export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/support/global-setup.js',
  // Une seule pile partagée et des films en lecture : un test à la fois, dans l'ordre.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL,
    locale: 'fr-FR',
    // Un échec laisse de quoi comprendre : trace (actions, réseau, DOM), capture et vidéo de la page.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
