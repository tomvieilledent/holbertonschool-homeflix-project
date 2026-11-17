import { createBrowserRouter } from 'react-router-dom'
import AppLayout from '@/app/AppLayout'
import BareLayout from '@/app/BareLayout'
import NotFoundPage from '@/app/NotFoundPage'
import LoginPage from '@/features/auth/LoginPage'
import ProfilesPage from '@/features/auth/ProfilesPage'
import RequireAuth from '@/features/auth/RequireAuth'
import RequireRole from '@/features/auth/RequireRole'
import DetailPage from '@/features/catalogue/DetailPage'
import HomePage from '@/features/catalogue/HomePage'
import PlayerPage from '@/features/player/PlayerPage'

const lazyPage = (loader) => ({
  lazy: async () => ({ Component: (await loader()).default }),
})

export const routes = [
  {
    // Sans en-tête : pages publiques et choix du profil.
    element: <BareLayout />,
    children: [
      { path: '/login', element: <LoginPage /> },
      {
        element: <RequireAuth />,
        children: [{ path: '/profiles', element: <ProfilesPage /> }],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    // Écrans connectés, avec en-tête et navigation.
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <HomePage /> },
          { path: '/media/:mediaId', element: <DetailPage /> },
          { path: '/watch/:mediaId', element: <PlayerPage /> },
          {
            element: <RequireRole role="ADMIN" />,
            children: [
              { path: '/admin', ...lazyPage(() => import('@/features/admin/AdminPage')) },
              {
                path: '/admin/acquisition',
                ...lazyPage(() => import('@/features/admin/AcquisitionPage')),
              },
            ],
          },
        ],
      },
    ],
  },
]

export const router = createBrowserRouter(routes)
