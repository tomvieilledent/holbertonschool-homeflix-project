import { useEffect } from 'react'
import { config } from '@/app/config'

/** Titre d'onglet d'une page : « Catalogue — Homeflix », ou le nom de l'application seul. */
export const pageTitle = (name) => (name ? `${name} — ${config.appName}` : config.appName)

/**
 * Précise le titre de l'onglet quand il dépend des données de la page (nom d'un film, accès refusé). Sans nom, le
 * titre de la route reste en place.
 * @param {string|null|undefined} name
 */
export default function useDocumentTitle(name) {
  // Sans liste de dépendances : après un changement de page, la route vient de réécrire le titre.
  useEffect(() => {
    if (name) document.title = pageTitle(name)
  })
}
