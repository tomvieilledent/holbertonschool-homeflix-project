import MovieCard from '@/features/catalogue/MovieCard'
import { useFavourites } from '@/features/favourites/favouritesContext'

/**
 * `MovieCard` reliée à « Ma liste » : l'état du bouton vient du magasin partagé, donc il est le même dans toutes
 * les vues. Le bouton n'apparaît qu'une fois la liste chargée (sinon son état serait faux).
 * Reçoit les mêmes props que `MovieCard`.
 */
export default function FavouriteCard({ media, ...props }) {
  const favourites = useFavourites()
  return (
    <MovieCard
      media={media}
      isFavourite={favourites.isFavourite(media.id)}
      favouritePending={favourites.isPending(media.id)}
      onToggleFavourite={favourites.status === 'ready' ? favourites.toggle : undefined}
      {...props}
    />
  )
}
