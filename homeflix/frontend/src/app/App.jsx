import { RouterProvider } from 'react-router-dom'
import { router } from '@/app/router'
import ErrorBoundary from '@/components/ErrorBoundary'
import AuthProvider from '@/features/auth/AuthProvider'

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ErrorBoundary>
  )
}
