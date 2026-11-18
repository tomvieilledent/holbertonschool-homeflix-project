import { Link } from 'react-router-dom'
import Button from '@/components/Button'
import AvailabilityBadge from '@/features/catalogue/AvailabilityBadge'
import Poster from '@/features/catalogue/Poster'
import { formatDuration } from '@/features/catalogue/format'
import '@/features/catalogue/MovieCard.css'

/**
 * Carte d'un film (accueil, catalogue, recherche). Le titre est rendu comme du texte : React
 * échappe tout contenu, jamais de HTML. La carte est un lien (focus et Entrée natifs) ; le bouton
 * « Ma liste » reste à côté du lien pour ne pas imbriquer deux éléments interactifs.
 * @param {object} props
 * @param {{id: string, title: string, posterUrl?: string|null, genres?: string[], durationSeconds?: number|null,
 *   availability: 'AVAILABLE'|'UNAVAILABLE'|'DOWNLOADING'}} props.media Résumé de média (contrat Library).
 * @param {boolean} [props.isFavourite]
 * @param {(media: object) => void} [props.onToggleFavourite] Si absent, le bouton « Ma liste » n'est pas affiché.
 * @param {boolean} [props.favouritePending] Désactive le bouton pendant l'appel serveur.
 * @param {{positionSeconds: number, durationSeconds?: number|null}} [props.progress] Reprise de lecture :
 *   affiche une barre de progression (« Continuer à regarder »).
 */
export default function MovieCard({
  media,
  isFavourite = false,
  onToggleFavourite,
  favouritePending = false,
  progress,
}) {
  const { id, title, posterUrl, genres = [], durationSeconds, availability } = media
  const details = [genres[0], formatDuration(durationSeconds)].filter(Boolean).join(' · ')

  return (
    <article className="movie-card">
      <Link to={`/media/${encodeURIComponent(id)}`} className="movie-card__link">
        <Poster url={posterUrl} />
        <h3 className="movie-card__title">{title}</h3>
        {details && <p className="movie-card__meta">{details}</p>}
        {progress?.durationSeconds > 0 && (
          <progress
            className="movie-card__progress"
            max={progress.durationSeconds}
            value={Math.min(progress.positionSeconds, progress.durationSeconds)}
            aria-label={`Progression de « ${title} »`}
          />
        )}
      </Link>
      <div className="movie-card__footer">
        <AvailabilityBadge availability={availability} />
        {onToggleFavourite && (
          <Button
            variant="ghost"
            aria-pressed={isFavourite}
            disabled={favouritePending}
            onClick={() => onToggleFavourite(media)}
          >
            {isFavourite ? 'Dans ma liste' : 'Ma liste'}
            <span className="visually-hidden">
              {isFavourite ? ` : retirer « ${title} »` : ` : ajouter « ${title} »`}
            </span>
          </Button>
        )}
      </div>
    </article>
  )
}
