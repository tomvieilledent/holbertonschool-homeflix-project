import { useRouteError } from 'react-router-dom'
import ErrorState from '@/components/ErrorState'

/** Écran d'erreur des routes : erreur de rendu, chargement raté d'une page admin, etc. */
export default function RouteErrorPage() {
  const error = useRouteError()
  console.error('Erreur de route :', error)

  return (
    <ErrorState
      title="Oups, quelque chose s’est mal passé"
      description="Cette page n’a pas pu s’afficher. Réessayez ou revenez à l’accueil."
      onRetry={() => window.location.reload()}
    >
      <a href="/">Retour à l’accueil</a>
    </ErrorState>
  )
}
