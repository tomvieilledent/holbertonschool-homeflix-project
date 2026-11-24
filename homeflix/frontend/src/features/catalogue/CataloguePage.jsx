import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import Button from '@/components/Button'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import Pagination from '@/components/Pagination'
import CatalogueFilters from '@/features/catalogue/CatalogueFilters'
import GridSkeleton from '@/features/catalogue/GridSkeleton'
import FavouriteCard from '@/features/favourites/FavouriteCard'
import '@/features/catalogue/CataloguePage.css'
import { isAbortError } from '@/services/api'
import { listGenres, listMedia } from '@/services/catalogue'

export const PAGE_SIZE = 20

/** Numéro de page de l'URL (à partir de 1) ; toute valeur invalide donne la page 1. */
export const pageFromParams = (params) => {
  const page = Number.parseInt(params.get('page') ?? '1', 10)
  return Number.isInteger(page) && page >= 1 ? page : 1
}

/** Recherche et genre de l'URL (`?q=sintel&genre=Animation`), vides si absents. */
export const filtersFromParams = (params) => ({
  q: (params.get('q') ?? '').trim(),
  genre: params.get('genre') ?? '',
})

/** URL du catalogue pour une page, en gardant la recherche et le genre : tout est partageable. */
export function catalogueUrl(params, page) {
  const next = new URLSearchParams(params)
  if (page <= 1) next.delete('page')
  else next.set('page', String(page))
  const search = next.toString()
  return search ? `/catalogue?${search}` : '/catalogue'
}

/**
 * Catalogue : grille paginée des médias (`GET /media`), avec recherche par titre et filtre par genre.
 * Page, recherche et genre sont dans l'URL : liens, retour arrière et rechargement fonctionnent, et les
 * filtres se partagent. Une requête devenue inutile (nouvelle frappe, autre page) est annulée.
 */
export default function CataloguePage() {
  const [params, setParams] = useSearchParams()
  const page = pageFromParams(params)
  const { q, genre } = filtersFromParams(params)
  const filtered = Boolean(q || genre)
  const [data, setData] = useState(null) // null = chargement
  const [error, setError] = useState(null)
  const [genres, setGenres] = useState([])
  const headingRef = useRef(null)
  const firstRender = useRef(true)

  const load = useCallback(
    (signal) => {
      setError(null)
      setData(null)
      listMedia({ page: page - 1, size: PAGE_SIZE, q, genre }, signal)
        .then((result) => {
          if (!signal?.aborted) setData(result) // une réponse périmée ne remplace jamais la dernière
        })
        .catch((failure) => {
          if (!isAbortError(failure) && !signal?.aborted) setError(failure)
        })
    },
    [page, q, genre],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  useEffect(() => {
    const controller = new AbortController()
    listGenres(controller.signal)
      .then((names) => {
        if (!controller.signal.aborted && Array.isArray(names)) setGenres(names)
      })
      .catch(() => {}) // le filtre par genre est facultatif : la recherche reste utilisable
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    // Ne pas voler le focus pendant la saisie : seulement quand on change de page avec la pagination.
    if (document.activeElement?.closest?.('input, select, textarea')) return
    headingRef.current?.focus()
  }, [page])

  /** Met à jour un filtre dans l'URL ; une valeur vide le retire, et on revient à la première page. */
  const setFilter = (name, value, { replace = false } = {}) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        if (value) next.set(name, value)
        else next.delete(name)
        next.delete('page')
        return next
      },
      { replace },
    )

  const clearFilters = () => setParams({}, { replace: true })

  let content
  if (error) {
    content = <ErrorState description={error.message} onRetry={() => load()} />
  } else if (data === null) {
    content = <GridSkeleton />
  } else if (data.total === 0 && !filtered) {
    content = (
      <EmptyState
        title="Le catalogue est vide"
        description="Aucun film à afficher pour le moment. Demandez à l’administrateur de configurer la bibliothèque."
      />
    )
  } else if (data.total === 0) {
    content = (
      <EmptyState
        title={q ? `Aucun résultat pour « ${q} »` : 'Aucun résultat'}
        description="Vérifiez l’orthographe, essayez un mot plus court ou moins de mots, ou retirez le filtre de genre."
        icon="?"
      >
        <Button variant="secondary" onClick={clearFilters}>
          Effacer la recherche et les filtres
        </Button>
      </EmptyState>
    )
  } else if (page > data.totalPages) {
    // Page hors limites (lien périmé) : on revient à la dernière page existante.
    return <Navigate to={catalogueUrl(params, data.totalPages)} replace />
  } else {
    content = (
      <>
        {filtered && (
          <p role="status" className="catalogue__count">
            {data.total} résultat{data.total > 1 ? 's' : ''}
          </p>
        )}
        <ul className="catalogue__grid">
          {data.items.map((media) => (
            <li key={media.id}>
              <FavouriteCard media={media} />
            </li>
          ))}
        </ul>
        <Pagination
          page={page}
          totalPages={data.totalPages}
          hrefFor={(target) => catalogueUrl(params, target)}
          label="Pagination du catalogue"
        />
      </>
    )
  }

  return (
    <section className="catalogue">
      <h1 ref={headingRef} tabIndex={-1}>
        Catalogue
      </h1>
      <CatalogueFilters
        query={q}
        genre={genre}
        genres={genres}
        onQueryChange={(value) => setFilter('q', value, { replace: true })}
        onGenreChange={(value) => setFilter('genre', value)}
      />
      {content}
    </section>
  )
}
