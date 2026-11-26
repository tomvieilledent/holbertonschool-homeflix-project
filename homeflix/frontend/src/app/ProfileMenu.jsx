import { useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/authContext'

/** Menu du compte : changer de profil, gérer son compte, se déconnecter. Échap, un clic ou le focus à l'extérieur le ferme. */
export default function ProfileMenu() {
  const { account, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const toggleRef = useRef(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        toggleRef.current?.focus()
      }
    }
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [open])

  const signOut = async () => {
    setOpen(false)
    // Navigation d'abord : l'écran quitté (le lecteur, par exemple) se ferme tant que la session est encore ouverte.
    navigate('/login', { replace: true })
    await logout()
  }

  return (
    <div
      className="profile-menu"
      ref={rootRef}
      onBlur={(event) => {
        // Tabulation hors du menu : on le ferme (un clic à l'extérieur est géré plus haut).
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <button
        ref={toggleRef}
        type="button"
        className="profile-menu__toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {account?.username}
        <span aria-hidden="true"> ▾</span>
      </button>
      {open && (
        <div id={panelId} className="profile-menu__panel">
          <Link to="/profiles" onClick={() => setOpen(false)}>
            Changer de profil
          </Link>
          <Link to="/profiles/manage" onClick={() => setOpen(false)}>
            Gérer les profils
          </Link>
          <Link to="/compte" onClick={() => setOpen(false)}>
            Mon compte
          </Link>
          <button type="button" onClick={signOut}>
            Se déconnecter
          </button>
        </div>
      )}
    </div>
  )
}
