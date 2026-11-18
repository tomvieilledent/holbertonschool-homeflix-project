import { useRef } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import ProfileMenu from '@/app/ProfileMenu'
import Logo from '@/components/Logo'
import { useAuth } from '@/features/auth/authContext'
import '@/app/AppLayout.css'

/** Mise en page des écrans connectés : lien d'évitement, en-tête, navigation, menu profil et contenu. */
export default function AppLayout() {
  const { account } = useAuth()
  const mainRef = useRef(null)

  const skipToContent = (event) => {
    event.preventDefault()
    mainRef.current?.focus()
  }

  return (
    <>
      <a className="skip-link" href="#main-content" onClick={skipToContent}>
        Aller au contenu principal
      </a>
      <header className="app-header">
        <Link to="/" className="app-header__logo" aria-label="Homeflix, accueil">
          <Logo height={32} />
        </Link>
        <nav className="app-nav" aria-label="Navigation principale">
          <NavLink to="/" end>
            Accueil
          </NavLink>
          {account?.role === 'ADMIN' && <NavLink to="/admin">Administration</NavLink>}
        </nav>
        <ProfileMenu />
      </header>
      <main id="main-content" ref={mainRef} tabIndex={-1} className="app-main">
        <Outlet />
      </main>
    </>
  )
}
