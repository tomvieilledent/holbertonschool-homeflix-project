import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'

const fromHere = (path) => fileURLToPath(new URL(path, import.meta.url))
const fixturesDir = fromHere('../../docs/api/fixtures')

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

  // Reproduit nginx : /api/<service>/x -> <service>:<port>/api/x
  const proxyService = (name, port) => ({
    [`/api/${name}`]: {
      ...target(port),
      rewrite: (path) => path.replace(new RegExp(`^/api/${name}`), '/api'),
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
      css: false,
    },
    server: {
      fs: { allow: [fromHere('.'), fixturesDir] },
      proxy: {
        ...proxyService('identity', 8081),
        ...proxyService('library', 8082),
        ...proxyService('acquisition', 8083),
      },
    },
  }
})
