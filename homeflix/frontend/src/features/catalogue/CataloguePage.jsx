import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import Pagination from '@/components/Pagination'
import Skeleton from '@/components/Skeleton'
import MovieCard from '@/features/catalogue/MovieCard'
import '@/features/catalogue/CataloguePage.css'
import { isAbortError } from '@/services/api'
import { listMedia } from '@/services/catalogue'

export const PAGE_SIZE = 20

/** Numéro de page de l'URL (à partir de 1) ; toute valeur invalide donne la page 1. */
export const pageFromParams = (params) => {
  const page = Number.parseInt(params.get('page') ?? '1', 10)
  return Number.isInteger(page) && page >= 1 ? page : 1
}

const pageUrl = (page) => (page <= 1 ? '/catalogue' : `/catalogue?page=${page}`)

function GridSkeleton() {
  return (
    <>
      <span role="status" className="visually-hidden">
        Chargement du catalogue
      </span>
      <div className="catalogue__grid" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} variant="rect" width="100%" height={288} />
        ))}
      </div>
    </>
  )
}

/**
 * Catalogue : grille paginée de tous les médias (`GET /media`). La page courante est dans l'URL
 * (`?page=2`) : liens, retour arrière et rechargement fonctionnent. Après un changement de page, le
 * focus revient sur le titre.
 */
export default function CataloguePage() {
  const [params] = useSearchParams()
  const page = pageFromParams(params)
  const [data, setData] = useState(null) // null = chargement
  const [error, setError] = useState(null)
  const headingRef = useRef(null)
  const firstRender = useRef(true)

  const load = useCallback(
    (signal) => {
      setError(null)
      setData(null)
      listMedia({ page: page - 1, size: PAGE_SIZE }, signal)
        .then(setData)
        .catch((failure) => {
          if (!isAbortError(failure)) setError(failure)
        })
    },
    [page],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    headingRef.current?.focus()
  }, [page])

  let content
  if (error) {
    content = <ErrorState description={error.message} onRetry={() => load()} />
  } else if (data === null) {
    content = <GridSkeleton />
  } else if (data.total === 0) {
    content = (
      <EmptyState
        title="Le catalogue est vide"
        description="Aucun film à afficher pour le moment. Demandez à l’administrateur de configurer la bibliothèque."
      />
    )
  } else if (page > data.totalPages) {
    // Page hors limites (lien périmé) : on revient à la dernière page existante.
    return <Navigate to={pageUrl(data.totalPages)} replace />
  } else {
    content = (
      <>
        <ul className="catalogue__grid">
          {data.items.map((media) => (
            <li key={media.id}>
              <MovieCard media={media} />
            </li>
          ))}
        </ul>
        <Pagination page={page} totalPages={data.totalPages} hrefFor={pageUrl} label="Pagination du catalogue" />
      </>
    )
  }

  return (
    <section className="catalogue">
      <h1 ref={headingRef} tabIndex={-1}>
        Catalogue
      </h1>
      {content}
    </section>
  )
}
