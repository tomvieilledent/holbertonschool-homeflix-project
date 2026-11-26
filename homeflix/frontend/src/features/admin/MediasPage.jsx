import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import Button from '@/components/Button'
import '@/components/Button.css'
import ConfirmModal from '@/components/ConfirmModal'
import DataTable from '@/components/DataTable'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import Field from '@/components/Field'
import Pagination from '@/components/Pagination'
import Skeleton from '@/components/Skeleton'
import EditMediaModal from '@/features/admin/EditMediaModal'
import AvailabilityBadge from '@/features/catalogue/AvailabilityBadge'
import { pageFromParams } from '@/features/catalogue/CataloguePage'
import { formatDuration } from '@/features/catalogue/format'
import { isAbortError } from '@/services/api'
import { deleteMedia, listMedia, updateMedia } from '@/services/catalogue'
import '@/features/admin/MediasPage.css'

const PAGE_SIZE = 20

function mediasUrl(page, q) {
  const query = new URLSearchParams()
  if (q) query.set('q', q)
  if (page > 1) query.set('page', String(page))
  const text = query.toString()
  return text ? `/admin/medias?${text}` : '/admin/medias'
}

function MediasSkeleton() {
  return (
    <>
      <span role="status" className="visually-hidden">
        Chargement des films
      </span>
      <div className="medias__skeleton" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((row) => (
          <Skeleton key={row} variant="rect" width="100%" height={48} />
        ))}
      </div>
    </>
  )
}

/**
 * Médias : corriger les métadonnées d'un film (titre, description, genres, année) ou retirer son entrée du catalogue.
 * Une correction n'est pas écrasée par une réindexation ; retirer une entrée ne touche jamais au fichier, mais
 * l'exclut des indexations suivantes. La page, la recherche et la modification sont reflétées dans le catalogue.
 */
export default function MediasPage() {
  const [params, setParams] = useSearchParams()
  const page = pageFromParams(params)
  const q = (params.get('q') ?? '').trim()
  const [search, setSearch] = useState(q)
  const [data, setData] = useState(null) // null = chargement
  const [error, setError] = useState(null)
  const [dialog, setDialog] = useState(null) // { type: 'edit' | 'delete', media }
  const [notice, setNotice] = useState('')

  const load = useCallback(
    (signal) => {
      setError(null)
      listMedia({ page: page - 1, size: PAGE_SIZE, q }, signal)
        .then(setData)
        .catch((failure) => {
          if (!isAbortError(failure)) setError(failure)
        })
    },
    [page, q],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const close = () => setDialog(null)
  /** Lance l'action ; en cas de succès, ferme la modale, annonce le résultat et recharge la page. */
  const run = async (action, message) => {
    await action()
    setDialog(null)
    setNotice(message)
    load()
  }

  const submitSearch = (event) => {
    event.preventDefault()
    setParams(search.trim() ? { q: search.trim() } : {}, { replace: true })
  }

  if (error) return <ErrorState description={error.message} onRetry={() => load()} />
  if (data === null) {
    return (
      <section>
        <h2>Médias</h2>
        <MediasSkeleton />
      </section>
    )
  }
  if (data.totalPages > 0 && page > data.totalPages) {
    return <Navigate to={mediasUrl(data.totalPages, q)} replace /> // page hors limites (liste raccourcie)
  }

  const target = dialog?.media
  const columns = [
    { key: 'title', header: 'Titre', rowHeader: true, render: (media) => media.title },
    { key: 'year', header: 'Année', render: (media) => media.year ?? '—' },
    { key: 'genres', header: 'Genres', render: (media) => (media.genres.length > 0 ? media.genres.join(', ') : '—') },
    { key: 'duration', header: 'Durée', render: (media) => formatDuration(media.durationSeconds) || '—' },
    { key: 'availability', header: 'Disponibilité', render: (media) => <AvailabilityBadge availability={media.availability} /> },
    {
      key: 'actions',
      header: 'Actions',
      render: (media) => (
        <div className="medias__actions">
          <Button variant="secondary" aria-label={`Modifier ${media.title}`} onClick={() => setDialog({ type: 'edit', media })}>
            Modifier
          </Button>
          <Button
            variant="danger"
            aria-label={`Retirer ${media.title} du catalogue`}
            onClick={() => setDialog({ type: 'delete', media })}
          >
            Retirer
          </Button>
        </div>
      ),
    },
  ]
  return (
    <section className="medias">
      <h2>Médias</h2>
      <p className="medias__hint">
        Corrigez le titre, la description, les genres ou l’année d’un film : vos corrections ne sont pas écrasées par
        une réindexation.
      </p>

      <form className="medias__search" role="search" aria-label="Rechercher un film" onSubmit={submitSearch}>
        <Field
          label="Rechercher un titre"
          type="search"
          value={search}
          autoComplete="off"
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button type="submit" variant="secondary">
          Rechercher
        </Button>
      </form>

      <div role="status" className="medias__notice">
        {notice}
      </div>

      {data.items.length === 0 ? (
        <EmptyState
          title={q ? `Aucun film pour « ${q} »` : 'Aucun film dans le catalogue'}
          description={
            q
              ? 'Vérifiez l’orthographe ou essayez un mot plus court.'
              : 'Ajoutez un dossier dans « Bibliothèque » puis lancez une indexation.'
          }
        >
          {!q && (
            <Link className="btn btn--secondary" to="/admin/bibliotheque">
              Ouvrir la bibliothèque
            </Link>
          )}
        </EmptyState>
      ) : (
        <>
          <p className="medias__count">
            {data.total} film{data.total > 1 ? 's' : ''}
            {q ? ` pour « ${q} »` : ''}
          </p>
          <DataTable caption="Films du catalogue" columns={columns} rows={data.items} />
          <Pagination
            page={page}
            totalPages={data.totalPages}
            hrefFor={(target) => mediasUrl(target, q)}
            label="Pagination des films"
          />
        </>
      )}

      {dialog?.type === 'edit' && (
        <EditMediaModal
          media={target}
          onSubmit={(changes) =>
            run(() => updateMedia(target.id, changes), `« ${changes.title ?? target.title} » a été mis à jour.`)
          }
          onClose={close}
        />
      )}
      {dialog?.type === 'delete' && (
        <ConfirmModal
          title={`Retirer « ${target.title} » du catalogue ?`}
          confirmLabel="Retirer du catalogue"
          onConfirm={() => run(() => deleteMedia(target.id), `« ${target.title} » a été retiré du catalogue.`)}
          onClose={close}
        >
          <p>
            <strong>Le fichier du film n’est ni modifié ni supprimé :</strong> il reste sur votre disque. Seule l’entrée
            du catalogue est retirée, et elle ne sera pas recréée par les prochaines indexations.
          </p>
        </ConfirmModal>
      )}
    </section>
  )
}
