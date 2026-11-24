import Skeleton from '@/components/Skeleton'
import '@/features/catalogue/CataloguePage.css'

/**
 * Silhouettes d'une grille de cartes pendant le chargement ; le libellé est annoncé une seule fois aux lecteurs
 * d'écran.
 * @param {object} props
 * @param {string} [props.label]
 */
export default function GridSkeleton({ label = 'Chargement du catalogue' }) {
  return (
    <>
      <span role="status" className="visually-hidden">
        {label}
      </span>
      <div className="catalogue__grid" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} variant="rect" width="100%" height={288} />
        ))}
      </div>
    </>
  )
}
