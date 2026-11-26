import { useCallback, useEffect, useState } from 'react'
import ErrorState from '@/components/ErrorState'
import Skeleton from '@/components/Skeleton'
import CompletedRow from '@/features/catalogue/CompletedRow'
import EmptyLibrary from '@/features/catalogue/EmptyLibrary'
import MediaRow from '@/features/catalogue/MediaRow'
import FavouriteCard from '@/features/favourites/FavouriteCard'
import { useFavourites } from '@/features/favourites/favouritesContext'
import '@/features/catalogue/HomePage.css'
import { isAbortError } from '@/services/api'
import { getHome } from '@/services/library'

const isEmpty = (home) =>
  home.continueWatching.length === 0 &&
  home.recentlyAdded.length === 0 &&
  home.categories.length === 0

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
  const favourites = useFavourites()

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

  const card = (media, extra) => <FavouriteCard key={media.id} media={media} {...extra} />

  if (error) return <ErrorState description={error.message} onRetry={() => load()} />
  if (home === null) return <HomeSkeleton />
  if (isEmpty(home)) {
    // Un catalogue sans film disponible peut garder des titres terminés : ils restent visibles.
    return (
      <div className="home">
        <EmptyLibrary />
        <CompletedRow />
      </div>
    )
  }

  return (
    <div className="home">
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
      {favourites.status === 'ready' &&
        (favourites.items.length > 0 ? (
          <MediaRow title="Ma liste">{favourites.items.map((media) => card(media))}</MediaRow>
        ) : (
          <section className="home__hint" aria-labelledby="home-favourites-title">
            <h2 id="home-favourites-title">Ma liste</h2>
            <p>Votre liste est vide. Ajoutez des films avec le bouton « Ma liste » d’une carte.</p>
          </section>
        ))}
      <CompletedRow />
    </div>
  )
}

/**
 * Accueil du profil actif (`GET /home`) : continuer à regarder, ajoutés récemment, catégories,
 * « Ma liste » (celle du magasin partagé `useFavourites`, donc à jour quand on ajoute ou retire un film) et les
 * titres terminés (`CompletedRow`). Une rangée vide est masquée, sauf « Ma liste » qui explique comment la remplir ;
 * si le catalogue est vide, `EmptyLibrary` dit quoi faire selon le rôle. Le titre de page est présent dans tous les
 * états.
 */
export default function HomePage() {
  return (
    <>
      <h1 className="visually-hidden">Accueil</h1>
      <HomeSections />
    </>
  )
}
