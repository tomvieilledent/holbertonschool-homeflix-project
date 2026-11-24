import { createBrowserRouter } from 'react-router-dom'
import AppLayout from '@/app/AppLayout'
import BareLayout from '@/app/BareLayout'
import NotFoundPage from '@/app/NotFoundPage'
import RouteErrorPage from '@/app/RouteErrorPage'
import LoginPage from '@/features/auth/LoginPage'
import ManageProfilesPage from '@/features/auth/ManageProfilesPage'
import ProfilesPage from '@/features/auth/ProfilesPage'
import MyListPage from '@/features/favourites/MyListPage'
import RequireAuth from '@/features/auth/RequireAuth'
import RequireProfile from '@/features/auth/RequireProfile'
import RequireRole from '@/features/auth/RequireRole'
import SetupPage from '@/features/auth/SetupPage'
import CataloguePage from '@/features/catalogue/CataloguePage'
import DetailPage from '@/features/catalogue/DetailPage'
import HomePage from '@/features/catalogue/HomePage'
import IntroGate from '@/features/intro/IntroGate'
import PlayerPage from '@/features/player/PlayerPage'

const lazyPage = (loader) => ({
  lazy: async () => ({ Component: (await loader()).default }),
})

export const routes = [
  {
    // Erreur de rendu ou de chargement d'une route : écran d'erreur au lieu d'une page blanche.
    errorElement: <RouteErrorPage />,
    children: [
      {
        // Sans en-tête : pages publiques et choix du profil.
        element: <BareLayout />,
        children: [
          {
            // L'intro du logo précède la connexion, une fois par session.
            path: '/login',
            element: (
              <IntroGate>
                <LoginPage />
              </IntroGate>
            ),
          },
          { path: '/setup', element: <SetupPage /> },
          {
            element: <RequireAuth />,
            children: [
              { path: '/profiles', element: <ProfilesPage /> },
              { path: '/profiles/manage', element: <ManageProfilesPage /> },
            ],
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
              {
                // Pas d'accueil, de fiche ni de lecture sans profil actif.
                element: <RequireProfile />,
                children: [
                  { path: '/', element: <HomePage /> },
                  { path: '/catalogue', element: <CataloguePage /> },
                  { path: '/ma-liste', element: <MyListPage /> },
              { path: '/media/:mediaId', element: <DetailPage /> },
                  { path: '/watch/:mediaId', element: <PlayerPage /> },
                ],
              },
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
    ],
  },
]

export const router = createBrowserRouter(routes)
