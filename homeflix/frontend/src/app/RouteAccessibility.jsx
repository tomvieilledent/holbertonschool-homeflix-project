import { useLayoutEffect } from 'react'
import { Outlet, useLocation, useMatches } from 'react-router-dom'
import { pageTitle } from '@/hooks/useDocumentTitle'
import useFocusRecovery from '@/hooks/useFocusRecovery'

/**
 * Racine des routes : titre de l'onglet tiré de la route affichée (`handle.title`) et suivi du focus clavier d'une
 * page à l'autre.
 */
export default function RouteAccessibility() {
  const { pathname } = useLocation()
  const title = useMatches().findLast((match) => match.handle?.title)?.handle.title
  // Avant les effets des pages : une page peut ensuite préciser son titre (`useDocumentTitle`).
  useLayoutEffect(() => {
    document.title = pageTitle(title)
  }, [title, pathname])
  useFocusRecovery(pathname)
  return <Outlet />
}
