import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/features/auth/authContext'
import { profilesUrl } from '@/features/auth/redirect'

/**
 * Garde de route (à placer sous `RequireAuth`) : sans profil actif, renvoie vers « Qui regarde ? »
 * en mémorisant la destination. Le contenu est remonté à chaque changement de profil (`key`),
 * donc les écrans rechargent leurs données (favoris, progression) pour le nouveau profil.
 */
export default function RequireProfile() {
  const { activeProfileId } = useAuth()
  const location = useLocation()

  if (!activeProfileId) return <Navigate to={profilesUrl(location)} replace />
  return <Outlet key={activeProfileId} />
}
