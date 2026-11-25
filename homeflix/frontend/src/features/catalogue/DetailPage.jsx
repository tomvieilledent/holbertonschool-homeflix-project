import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Button from '@/components/Button'
import '@/components/Button.css'
import ErrorState from '@/components/ErrorState'
import Skeleton from '@/components/Skeleton'
import AvailabilityBadge from '@/features/catalogue/AvailabilityBadge'
import { formatDuration, playAction } from '@/features/catalogue/format'
import Poster from '@/features/catalogue/Poster'
import { useFavourites } from '@/features/favourites/favouritesContext'
import '@/features/catalogue/DetailPage.css'
import useDocumentTitle from '@/hooks/useDocumentTitle'
import { isAbortError } from '@/services/api'
import { getMedia } from '@/services/catalogue'
import { getProgress } from '@/services/library'

/** Pourquoi un film ne peut pas être lu : dit à l'utilisateur quoi faire, sans détail technique. */
const UNPLAYABLE = {
  UNAVAILABLE:
    'Ce film n’est pas disponible pour le moment : son fichier est introuvable ou inaccessible. Demandez à l’administrateur de vérifier la bibliothèque.',
  DOWNLOADING: 'Ce film est en cours de téléchargement. Il pourra être lu dès que le téléchargement sera terminé.',
}

function DetailSkeleton() {
  return (
    <>
      <span role="status" className="visually-hidden">
        Chargement de la fiche du film
      </span>
      <div className="detail__layout" aria-hidden="true">
        <Skeleton variant="rect" width="100%" height={360} />
        <Skeleton variant="text" lines={5} />
      </div>
    </>
  )
}

/**
 * Fiche d'un film : affiche, titre, année, genres, durée, disponibilité, description, lecture ou reprise
 * et « Ma liste ». Un film non disponible n'offre pas de lecture mais en explique la raison. Tout le texte
 * du serveur (titre, description) est affiché comme du texte, jamais comme du HTML.
 */
export default function DetailPage() {
  const { mediaId } = useParams()
  const [media, setMedia] = useState(null) // null = chargement
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  const favourites = useFavourites()
  useDocumentTitle(media?.title)

  const load = useCallback(
    (signal) => {
      setError(null)
      setMedia(null)
      // Le média est indispensable ; la progression ne doit pas empêcher d'afficher la fiche.
      Promise.all([getMedia(mediaId, signal), getProgress(mediaId, signal).catch(() => null)])
        .then(([found, progressResult]) => {
          if (signal?.aborted) return
          setMedia(found)
          setProgress(progressResult)
        })
        .catch((failure) => {
          if (!isAbortError(failure) && !signal?.aborted) setError(failure)
        })
    },
    [mediaId],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const back = (
    <Link className="touch-link" to="/catalogue">
      Retour au catalogue
    </Link>
  )

  if (error) {
    return (
      <ErrorState titleAs="h1" title="Film introuvable" description={error.message} onRetry={() => load()}>
        {back}
      </ErrorState>
    )
  }
  if (media === null) return <DetailSkeleton />

  const { title, description, posterUrl, genres, year, durationSeconds, availability } = media
  const meta = [year, genres.join(', '), formatDuration(durationSeconds)].filter(Boolean).join(' · ')
  const play = playAction(progress)
  const playable = availability === 'AVAILABLE'
  const watchUrl = `/watch/${encodeURIComponent(mediaId)}${play.startAt > 0 ? `?t=${play.startAt}` : ''}`

  return (
    <article className="detail">
      <p>{back}</p>
      <div className="detail__layout">
        <div className="detail__poster">
          <Poster url={posterUrl} />
        </div>
        <div className="detail__info">
          <h1 className="detail__title">{title}</h1>
          {meta && <p className="detail__meta">{meta}</p>}
          <p>
            <AvailabilityBadge availability={availability} />
          </p>
          {description && <p className="detail__description">{description}</p>}

          {progress?.state === 'STARTED' && progress.durationSeconds > 0 && (
            <progress
              className="detail__progress"
              max={progress.durationSeconds}
              value={Math.min(progress.positionSeconds, progress.durationSeconds)}
              aria-label="Progression de visionnage"
            />
          )}

          <div className="detail__actions">
            {playable ? (
              <Link className="btn btn--primary" to={watchUrl}>
                {play.label}
              </Link>
            ) : (
              <p className="detail__unplayable" role="note">
                {UNPLAYABLE[availability] ?? UNPLAYABLE.UNAVAILABLE}
              </p>
            )}
            {favourites.status === 'ready' && (
              <Button
                variant="secondary"
                aria-pressed={favourites.isFavourite(media.id)}
                busy={favourites.isPending(media.id)}
                onClick={() => favourites.toggle(media)}
              >
                {favourites.isFavourite(media.id) ? 'Dans ma liste' : 'Ajouter à ma liste'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}
