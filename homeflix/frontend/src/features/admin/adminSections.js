/**
 * Sections de l'administration, dans l'ordre de la navigation latérale. Chaque nouvel écran d'administration
 * ajoute sa ligne ici et sa route dans `app/router.jsx`.
 * @type {{to: string, label: string}[]}
 */
export const ADMIN_SECTIONS = [
  { to: '/admin/comptes', label: 'Comptes' },
  { to: '/admin/bibliotheque', label: 'Bibliothèque' },
  { to: '/admin/medias', label: 'Médias' },
  { to: '/admin/acquisition', label: 'Acquisition' },
]
