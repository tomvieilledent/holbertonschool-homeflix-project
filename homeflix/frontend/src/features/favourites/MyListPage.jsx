import { Link } from 'react-router-dom'
import '@/components/Button.css'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import GridSkeleton from '@/features/catalogue/GridSkeleton'
import FavouriteCard from '@/features/favourites/FavouriteCard'
import { useFavourites } from '@/features/favourites/favouritesContext'
import '@/features/catalogue/CataloguePage.css'

/**
 * « Ma liste » : les films mis de côté par le profil actif, les plus récents en premier. Retirer un film le fait
 * disparaître tout de suite ; si le serveur refuse, il revient à sa place avec un message.
 */
export default function MyListPage() {
  const { status, items, reload } = useFavourites()

  let content
  if (status === 'error') {
    content = <ErrorState description="Impossible de charger votre liste pour le moment." onRetry={reload} />
  } else if (status === 'loading') {
    content = <GridSkeleton label="Chargement de votre liste" />
  } else if (items.length === 0) {
    content = (
      <EmptyState
        title="Votre liste est vide"
        description="Ajoutez des films avec le bouton « Ma liste » d’une carte ou d’une fiche : ils apparaîtront ici."
      >
        <Link className="btn btn--primary" to="/catalogue">
          Parcourir le catalogue
        </Link>
      </EmptyState>
    )
  } else {
    content = (
      <>
        <p role="status" className="catalogue__count">
          {items.length} film{items.length > 1 ? 's' : ''} dans votre liste
        </p>
        <h2 className="visually-hidden">Films</h2>
        <ul className="catalogue__grid">
          {items.map((media) => (
            <li key={media.id}>
              <FavouriteCard media={media} />
            </li>
          ))}
        </ul>
      </>
    )
  }

  return (
    <section className="catalogue">
      <h1>Ma liste</h1>
      {content}
    </section>
  )
}
