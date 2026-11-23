import { NavLink, Outlet } from 'react-router-dom'
import { ADMIN_SECTIONS } from '@/features/admin/adminSections'
import '@/features/admin/AdminLayout.css'

/**
 * Section d'administration : titre, navigation latérale (en haut sur petit écran) et contenu de la page choisie.
 * À placer sous `RequireRole role="ADMIN"` : les liens ne sont qu'un confort, la sécurité réelle reste côté serveur.
 * Chaque page de section titre son contenu en `h2` ; le `h1` est celui de la section.
 */
export default function AdminLayout() {
  return (
    <div className="admin">
      <h1 className="admin__title">Administration</h1>
      <div className="admin__body">
        <nav className="admin-nav" aria-label="Sections de l’administration">
          <ul className="admin-nav__list">
            {ADMIN_SECTIONS.map(({ to, label }) => (
              <li key={to}>
                <NavLink to={to}>{label}</NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="admin__content">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
