import { Link } from 'react-router-dom'
import '@/components/Pagination.css'

/**
 * Numéros à afficher : première, dernière et voisines de la page courante, `null` pour une coupure (…).
 * @param {number} current Page courante (à partir de 1).
 * @param {number} total Nombre de pages.
 * @returns {(number|null)[]}
 */
export function pageWindow(current, total) {
  const wanted = new Set([1, total, current - 1, current, current + 1])
  const pages = [...wanted].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b)
  return pages.flatMap((page, index) => (index > 0 && page - pages[index - 1] > 1 ? [null, page] : [page]))
}

/**
 * Pagination par liens : chaque page a une vraie URL (copiable, retour arrière), et Tab puis Entrée
 * suffisent au clavier. La page courante porte `aria-current="page"` ; les extrémités sont désactivées
 * (texte non cliquable). Rien n'est affiché s'il n'y a qu'une page.
 * @param {object} props
 * @param {number} props.page Page courante (à partir de 1).
 * @param {number} props.totalPages
 * @param {(page: number) => string} props.hrefFor URL d'une page (à partir de 1).
 * @param {string} [props.label] Nom de la navigation.
 */
export default function Pagination({ page, totalPages, hrefFor, label = 'Pagination' }) {
  if (totalPages <= 1) return null

  const step = (target, text, name) =>
    target < 1 || target > totalPages ? (
      <span className="pagination__step pagination__step--disabled" aria-disabled="true">
        {text}
      </span>
    ) : (
      <Link className="pagination__step" to={hrefFor(target)} aria-label={name}>
        {text}
      </Link>
    )

  return (
    <nav className="pagination" aria-label={label}>
      <ul className="pagination__list">
        <li>{step(page - 1, '‹ Précédent', 'Page précédente')}</li>
        {pageWindow(page, totalPages).map((target, index) => (
          <li key={target ?? `gap-${index}`}>
            {target === null ? (
              <span aria-hidden="true">…</span>
            ) : (
              <Link
                className="pagination__page"
                to={hrefFor(target)}
                aria-label={`Page ${target}`}
                aria-current={target === page ? 'page' : undefined}
              >
                {target}
              </Link>
            )}
          </li>
        ))}
        <li>{step(page + 1, 'Suivant ›', 'Page suivante')}</li>
      </ul>
      <p className="pagination__status">
        Page {page} sur {totalPages}
      </p>
    </nav>
  )
}
