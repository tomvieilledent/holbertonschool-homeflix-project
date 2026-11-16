import { createBrowserRouter } from 'react-router-dom'
import NotFoundPage from '@/app/NotFoundPage'
import LoginPage from '@/features/auth/LoginPage'
import ProfilesPage from '@/features/auth/ProfilesPage'
import DetailPage from '@/features/catalogue/DetailPage'
import HomePage from '@/features/catalogue/HomePage'
import PlayerPage from '@/features/player/PlayerPage'

const lazyPage = (loader) => ({
  lazy: async () => ({ Component: (await loader()).default }),
})

export const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/profiles', element: <ProfilesPage /> },
  { path: '/media/:mediaId', element: <DetailPage /> },
  { path: '/watch/:mediaId', element: <PlayerPage /> },
  { path: '/admin', ...lazyPage(() => import('@/features/admin/AdminPage')) },
  {
    path: '/admin/acquisition',
    ...lazyPage(() => import('@/features/admin/AcquisitionPage')),
  },
  { path: '*', element: <NotFoundPage /> },
])
