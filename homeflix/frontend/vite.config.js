import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'

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
    plugins: [react()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy: {
        ...proxyService('identity', 8081),
        ...proxyService('library', 8082),
        ...proxyService('acquisition', 8083),
      },
    },
  }
})
