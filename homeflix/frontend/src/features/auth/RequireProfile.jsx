import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/features/auth/authContext'
import { profilesUrl } from '@/features/auth/redirect'
import ProfileScope from '@/features/favourites/ProfileScope'

/**
 * Garde de route (à placer sous `RequireAuth`) : sans profil actif, renvoie vers « Qui regarde ? »
 * en mémorisant la destination. Le contenu est remonté à chaque changement de profil (`key`),
 * donc les écrans rechargent leurs données (favoris, progression) pour le nouveau profil ; « Ma liste » et les
 * notifications sont partagées par tous les écrans du profil (`ProfileScope`).
 */
export default function RequireProfile() {
  const { activeProfileId } = useAuth()
  const location = useLocation()

  if (!activeProfileId) return <Navigate to={profilesUrl(location)} replace />
  return (
    <ProfileScope key={activeProfileId}>
      <Outlet />
    </ProfileScope>
  )
}
