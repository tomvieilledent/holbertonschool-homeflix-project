import { createBrowserRouter, Navigate } from 'react-router-dom'
import AppLayout from '@/app/AppLayout'
import BareLayout from '@/app/BareLayout'
import NotFoundPage from '@/app/NotFoundPage'
import RouteAccessibility from '@/app/RouteAccessibility'
import RouteErrorPage from '@/app/RouteErrorPage'
import AccountPage from '@/features/auth/AccountPage'
import AdminLayout from '@/features/admin/AdminLayout'
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
    // Titre de l'onglet (`handle.title`) et suivi du focus, pour toutes les pages.
    element: <RouteAccessibility />,
    children: [
      {
        // Sans en-tête : pages publiques et choix du profil.
        element: <BareLayout />,
        children: [
          {
            // L'intro du logo précède la connexion, une fois par session.
            path: '/login',
            handle: { title: 'Connexion' },
            element: (
              <IntroGate>
                <LoginPage />
              </IntroGate>
            ),
          },
          { path: '/setup', handle: { title: 'Première configuration' }, element: <SetupPage /> },
          {
            element: <RequireAuth />,
            children: [
              { path: '/profiles', handle: { title: 'Qui regarde ?' }, element: <ProfilesPage /> },
              { path: '/profiles/manage', handle: { title: 'Gérer les profils' }, element: <ManageProfilesPage /> },
            ],
          },
          { path: '*', handle: { title: 'Page introuvable' }, element: <NotFoundPage /> },
        ],
      },
      {
        // Écrans connectés, avec en-tête et navigation.
        element: <RequireAuth />,
        children: [
          {
            element: <AppLayout />,
            children: [
              // Le compte ne dépend pas du profil : accessible même sans profil actif.
              { path: '/compte', handle: { title: 'Mon compte' }, element: <AccountPage /> },
              {
                // Pas d'accueil, de fiche ni de lecture sans profil actif.
                element: <RequireProfile />,
                children: [
                  { path: '/', handle: { title: 'Accueil' }, element: <HomePage /> },
                  { path: '/catalogue', handle: { title: 'Catalogue' }, element: <CataloguePage /> },
                  { path: '/ma-liste', handle: { title: 'Ma liste' }, element: <MyListPage /> },
              { path: '/media/:mediaId', handle: { title: 'Fiche du film' }, element: <DetailPage /> },
                  { path: '/watch/:mediaId', handle: { title: 'Lecture' }, element: <PlayerPage /> },
                ],
              },
              {
                element: <RequireRole role="ADMIN" />,
                children: [
                  {
                    // Section d'administration : navigation latérale commune à toutes ses pages.
                    path: '/admin',
                    element: <AdminLayout />,
                    children: [
                      { index: true, element: <Navigate to="/admin/comptes" replace /> },
                      { path: 'comptes', handle: { title: 'Comptes · Administration' }, ...lazyPage(() => import('@/features/admin/AccountsPage')) },
                      { path: 'bibliotheque', handle: { title: 'Bibliothèque · Administration' }, ...lazyPage(() => import('@/features/admin/LibraryPage')) },
                      { path: 'medias', handle: { title: 'Médias · Administration' }, ...lazyPage(() => import('@/features/admin/MediasPage')) },
                      { path: 'acquisition', handle: { title: 'Acquisition · Administration' }, ...lazyPage(() => import('@/features/admin/AcquisitionPage')) },
                      { path: 'services', handle: { title: 'Services · Administration' }, ...lazyPage(() => import('@/features/admin/ServicesPage')) },
                    ],
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
