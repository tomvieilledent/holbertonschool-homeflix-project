import { useCallback, useEffect, useState } from 'react'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import Skeleton from '@/components/Skeleton'
import MediaRow from '@/features/catalogue/MediaRow'
import MovieCard from '@/features/catalogue/MovieCard'
import '@/features/catalogue/HomePage.css'
import { isAbortError } from '@/services/api'
import { addFavourite, getHome, removeFavourite } from '@/services/library'

const isEmpty = (home) =>
  home.continueWatching.length === 0 &&
  home.recentlyAdded.length === 0 &&
  home.categories.length === 0 &&
  home.favourites.length === 0

/** Silhouettes des rangées pendant le chargement (une seule annonce aux lecteurs d'écran). */
function HomeSkeleton() {
  return (
    <div className="home__skeleton">
      <Skeleton variant="rect" width="100%" height={24} label="Chargement de l’accueil" />
      {[0, 1, 2].map((row) => (
        <div key={row} className="home__skeleton-row">
          {[0, 1, 2, 3, 4].map((card) => (
            <Skeleton key={card} variant="rect" width={192} height={288} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Sections de l'accueil : chargement, erreur, bibliothèque vide ou les rangées. */
function HomeSections() {
  const [home, setHome] = useState(null) // null = chargement
  const [error, setError] = useState(null)
  const [pending, setPending] = useState(() => new Set())
  const [favouriteError, setFavouriteError] = useState('')

  const load = useCallback((signal) => {
    setError(null)
    getHome(signal)
      .then(setHome)
      .catch((failure) => {
        if (!isAbortError(failure)) setError(failure)
      })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const favouriteIds = new Set((home?.favourites ?? []).map((media) => media.id))

  const toggleFavourite = async (media) => {
    const wasFavourite = favouriteIds.has(media.id)
    setFavouriteError('')
    setPending((current) => new Set(current).add(media.id))
    try {
      await (wasFavourite ? removeFavourite(media.id) : addFavourite(media.id))
      setHome((current) => ({
        ...current,
        favourites: wasFavourite
          ? current.favourites.filter((item) => item.id !== media.id)
          : [media, ...current.favourites],
      }))
    } catch (failure) {
      setFavouriteError(failure.message)
    } finally {
      setPending((current) => {
        const next = new Set(current)
        next.delete(media.id)
        return next
      })
    }
  }

  const card = (media, extra) => (
    <MovieCard
      key={media.id}
      media={media}
      isFavourite={favouriteIds.has(media.id)}
      onToggleFavourite={toggleFavourite}
      favouritePending={pending.has(media.id)}
      {...extra}
    />
  )

  if (error) return <ErrorState description={error.message} onRetry={() => load()} />
  if (home === null) return <HomeSkeleton />
  if (isEmpty(home)) {
    return (
      <EmptyState
        title="Votre bibliothèque est vide"
        description="Aucun film à afficher pour le moment. Demandez à l’administrateur de configurer la bibliothèque (dossiers de médias) pour voir des films ici."
      />
    )
  }

  return (
    <div className="home">
      {favouriteError && <p role="alert">{favouriteError}</p>}
      {home.continueWatching.length > 0 && (
        <MediaRow title="Continuer à regarder">
          {home.continueWatching.map(({ media, progress }) => card(media, { progress }))}
        </MediaRow>
      )}
      {home.recentlyAdded.length > 0 && (
        <MediaRow title="Ajoutés récemment">{home.recentlyAdded.map((media) => card(media))}</MediaRow>
      )}
      {home.categories.map(({ genre, items }) => (
        <MediaRow key={genre} title={genre}>
          {items.map((media) => card(media))}
        </MediaRow>
      ))}
      {home.favourites.length > 0 ? (
        <MediaRow title="Ma liste">{home.favourites.map((media) => card(media))}</MediaRow>
      ) : (
        <section className="home__hint" aria-labelledby="home-favourites-title">
          <h2 id="home-favourites-title">Ma liste</h2>
          <p>Votre liste est vide. Ajoutez des films avec le bouton « Ma liste » d’une carte.</p>
        </section>
      )}
    </div>
  )
}

/**
 * Accueil du profil actif (`GET /home`) : continuer à regarder, ajoutés récemment, catégories et
 * « Ma liste ». Une rangée vide est masquée, sauf « Ma liste » qui explique comment la remplir ; si tout
 * est vide, la bibliothèque n'est sans doute pas configurée. Le titre de page est présent dans tous les états.
 */
export default function HomePage() {
  return (
    <>
      <h1 className="visually-hidden">Accueil</h1>
      <HomeSections />
    </>
  )
}
