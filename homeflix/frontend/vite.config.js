import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'

const fromHere = (path) => fileURLToPath(new URL(path, import.meta.url))
const apiDocsDir = fromHere('../../docs/api')
const fixturesDir = `${apiDocsDir}/fixtures`

// Sert le service worker de MSW uniquement avec `vite dev` : il n'est jamais copié dans le build.
const mswWorker = () => ({
  name: 'msw-worker-dev',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/mockServiceWorker.js', (_request, response) => {
      response.setHeader('Content-Type', 'text/javascript')
      response.setHeader('Service-Worker-Allowed', '/')
      response.end(readFileSync(fromHere('./node_modules/msw/lib/mockServiceWorker.js')))
    })
  },
})

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const target = (port) => ({
    target: `http://${env.VITE_DEV_PROXY_HOST || 'localhost'}:${port}`,
    changeOrigin: true,
  })

  // Reproduit nginx : /api/<service>/x -> <service>:<port>/api/x, et le chemin des cookies
  // (le refresh_token est posé avec Path=/api/v1/auth, le navigateur appelle /api/identity/v1/auth).
  const proxyService = (name, port) => ({
    [`/api/${name}`]: {
      ...target(port),
      rewrite: (path) => path.replace(new RegExp(`^/api/${name}`), '/api'),
      // http-proxy compare le chemin entier (pas un préfixe) : seul le cookie de refresh est concerné.
      cookiePathRewrite: { '/api/v1/auth': `/api/${name}/v1/auth` },
    },
  })

  return {
    plugins: [react(), mswWorker()],
    resolve: {
      alias: {
        '@': fromHere('./src'),
        // Fixtures JSON du contrat d'API, réutilisées par les mocks (voir src/mocks).
        '@fixtures': fixturesDir,
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.js',
      // Plus long que le délai d'une seule attente (5 s, voir setup.js) : les parcours et l'audit axe enchaînent
      // plusieurs écrans et dépassaient sinon la limite sur une machine chargée.
      testTimeout: 15_000,
      css: false,
    },
    server: {
      // Les mocks et les tests lisent les fixtures et les conventions de docs/api, hors du dossier frontend.
      fs: { allow: [fromHere('.'), apiDocsDir] },
      proxy: {
        ...proxyService('identity', 8081),
        ...proxyService('library', 8082),
        ...proxyService('acquisition', 8083),
      },
    },
  }
})
