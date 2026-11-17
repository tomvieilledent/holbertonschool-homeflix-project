import { useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/authContext'

/** Menu du compte : changer de profil, se déconnecter. Échap ou un clic à l'extérieur le ferme. */
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
    // Navigation d'abord : sinon la garde renverrait vers /login?next=<page courante>.
    navigate('/login', { replace: true })
    await logout()
  }

  return (
    <div className="profile-menu" ref={rootRef}>
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
          <button type="button" onClick={signOut}>
            Se déconnecter
          </button>
        </div>
      )}
    </div>
  )
}
