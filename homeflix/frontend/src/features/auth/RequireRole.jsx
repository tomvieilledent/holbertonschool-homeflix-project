import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '@/features/auth/authContext'
import useDocumentTitle from '@/hooks/useDocumentTitle'

/**
 * Garde de rôle, à placer sous `RequireAuth` : un compte sans le rôle demandé voit « Accès refusé ».
 * La vérification côté serveur reste la référence ; cette garde n'est qu'un confort d'interface.
 * @param {object} props
 * @param {'USER'|'ADMIN'} props.role Rôle exigé.
 */
export default function RequireRole({ role }) {
  const { account } = useAuth()
  const refused = account?.role !== role
  useDocumentTitle(refused ? 'Accès refusé' : null)

  if (refused) {
    return (
      <section>
        <h1>Accès refusé</h1>
        <p>Votre compte n’a pas les droits nécessaires pour consulter cette page.</p>
        <Link className="touch-link" to="/">Retour à l’accueil</Link>
      </section>
    )
  }
  return <Outlet />
}
