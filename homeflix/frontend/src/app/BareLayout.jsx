import { Outlet } from 'react-router-dom'
import Logo from '@/components/Logo'
import '@/app/AppLayout.css'

/** Mise en page sans en-tête : connexion, choix du profil, page introuvable. */
export default function BareLayout() {
  return (
    <main id="main-content" tabIndex={-1} className="bare-layout">
      <Logo height={48} />
      <Outlet />
    </main>
  )
}
