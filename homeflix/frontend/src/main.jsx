import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/index.css'
import App from '@/app/App.jsx'

// import.meta.env.DEV vaut `false` dans le build : ce bloc et tout le dossier src/mocks en sont retirés.
async function enableMocking() {
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS === 'true') {
    const { startMocking } = await import('@/mocks/browser')
    await startMocking()
  }
}

enableMocking().then(() => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
