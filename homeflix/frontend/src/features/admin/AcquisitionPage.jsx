import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import Button from '@/components/Button'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import Pagination from '@/components/Pagination'
import Skeleton from '@/components/Skeleton'
import { formatBytes, safeHttpUrl } from '@/features/admin/acquisitionFormat'
import RightsModal from '@/features/admin/RightsModal'
import { pageFromParams } from '@/features/catalogue/CataloguePage'
import { acknowledgeRights, getRightsNotice, listCatalogue, startDownload } from '@/services/acquisition'
import { isAbortError } from '@/services/api'
import '@/features/admin/AcquisitionPage.css'

const PAGE_SIZE = 20
const NOTICE_UPDATED = 'Le rappel des droits a été mis à jour. Relisez-le, puis acceptez-le de nouveau.'
const acquisitionUrl = (page) => (page <= 1 ? '/admin/acquisition' : `/admin/acquisition?page=${page}`)

function CatalogueSkeleton() {
  return (
    <>
      <span role="status" className="visually-hidden">
        Chargement du catalogue
      </span>
      <div className="acquisition__skeleton" aria-hidden="true">
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} variant="rect" width="100%" height={56} />
        ))}
      </div>
    </>
  )
}

/** Preuve de la licence : un lien vers la page officielle (jamais un lien `javascript:`). */
function Proof({ entry }) {
  const href = safeHttpUrl(entry.licenseProofUrl)
  if (!href) return <span>Preuve indisponible</span>
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`Preuve de la licence de ${entry.title} (s’ouvre dans un nouvel onglet)`}>
      Voir la preuve
    </a>
  )
}

/**
 * Catalogue d'acquisition : les contenus autorisés (source, licence et preuve de la licence) et leur téléchargement.
 * Il n'existe aucun champ pour saisir une adresse : on ne choisit que parmi les entrées du catalogue. Le premier
 * téléchargement du compte affiche d'abord le rappel des droits, à accepter ; il n'est plus demandé ensuite (tant que
 * la version du rappel ne change pas).
 */
export default function AcquisitionPage() {
  const [params] = useSearchParams()
  const page = pageFromParams(params)
  const [data, setData] = useState(null) // { catalogue, notice } ; null = chargement
  const [error, setError] = useState(null)
  const [dialog, setDialog] = useState(null) // { entry }
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(
    (signal) => {
      setError(null)
      Promise.all([listCatalogue({ page: page - 1, size: PAGE_SIZE }, signal), getRightsNotice(signal)])
        .then(([catalogue, rights]) => setData({ catalogue, rights }))
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

  /** Relit le rappel (sa version a pu changer) et le met à jour dans l'écran. */
  const refreshRights = async () => {
    const rights = await getRightsNotice()
    setData((current) => ({ ...current, rights }))
    return rights
  }

  /** Lance le téléchargement ; en cas de succès, annonce le résultat et recharge le catalogue. */
  const download = async (entry) => {
    await startDownload(entry.id)
    setNotice(`Téléchargement de « ${entry.title} » lancé.`)
    load()
  }

  const requestDownload = async (entry) => {
    setActionError('')
    setNotice('')
    if (!data.rights.acknowledged) {
      setDialog({ entry })
      return
    }
    setBusyId(entry.id)
    try {
      await download(entry)
    } catch (failure) {
      if (failure.code === 'RIGHTS_NOT_ACKNOWLEDGED') {
        // La version du rappel a changé depuis le chargement : le relire et le faire accepter de nouveau.
        try {
          await refreshRights()
          setDialog({ entry })
        } catch (refreshFailure) {
          setActionError(refreshFailure.message)
        }
      } else {
        setActionError(failure.message)
      }
    } finally {
      setBusyId(null)
    }
  }

  /** Acquitte le rappel puis lance le téléchargement. */
  const accept = async (entry) => {
    try {
      await acknowledgeRights(data.rights.version)
    } catch (failure) {
      if (failure.code === 'CONFLICT') {
        await refreshRights().catch(() => {})
        throw new Error(NOTICE_UPDATED)
      }
      throw failure
    }
    setData((current) => ({ ...current, rights: { ...current.rights, acknowledged: true } }))
    setDialog(null)
    try {
      await download(entry)
    } catch (failure) {
      // Le rappel est accepté : seule la demande de téléchargement a échoué.
      setActionError(failure.message)
      load()
    }
  }

  if (error) return <ErrorState description={error.message} onRetry={() => load()} />
  if (data === null) {
    return (
      <section>
        <h2>Acquisition</h2>
        <CatalogueSkeleton />
      </section>
    )
  }
  const { catalogue, rights } = data
  if (catalogue.totalPages > 0 && page > catalogue.totalPages) {
    return <Navigate to={acquisitionUrl(catalogue.totalPages)} replace /> // page hors limites
  }

  return (
    <section className="acquisition">
      <h2>Acquisition</h2>
      <p className="acquisition__hint">
        Seuls les contenus ci-dessous peuvent être téléchargés : chacun a une licence et une preuve de cette licence. Il
        n’est pas possible de saisir une adresse.
      </p>
      {!rights.acknowledged && (
        <p className="acquisition__hint">
          Avant votre premier téléchargement, vous devrez lire et accepter le rappel des droits.
        </p>
      )}

      <div role="status" className="acquisition__notice">
        {notice}
      </div>
      {actionError && <p role="alert">{actionError}</p>}

      {catalogue.items.length === 0 ? (
        <EmptyState title="Aucun contenu disponible" description="Le catalogue d’acquisition est vide pour le moment." />
      ) : (
        <>
          <div className="acquisition__scroll">
            <table className="acquisition__table">
              <caption className="visually-hidden">Contenus autorisés au téléchargement</caption>
              <thead>
                <tr>
                  <th scope="col">Titre</th>
                  <th scope="col">Source</th>
                  <th scope="col">Licence</th>
                  <th scope="col">Preuve</th>
                  <th scope="col">Taille</th>
                  <th scope="col">Téléchargement</th>
                </tr>
              </thead>
              <tbody>
                {catalogue.items.map((entry) => (
                  <tr key={entry.id}>
                    <th scope="row">{entry.title}</th>
                    <td>{entry.source}</td>
                    <td>{entry.license}</td>
                    <td>
                      <Proof entry={entry} />
                    </td>
                    <td>{formatBytes(entry.sizeBytes)}</td>
                    <td>
                      {entry.inLibrary ? (
                        <span>
                          Dans la bibliothèque
                          {entry.libraryMediaId && (
                            <>
                              {' · '}
                              <Link to={`/media/${encodeURIComponent(entry.libraryMediaId)}`} aria-label={`Voir ${entry.title} dans la bibliothèque`}>
                                Voir
                              </Link>
                            </>
                          )}
                        </span>
                      ) : entry.activeDownloadId ? (
                        <span>Téléchargement en cours</span>
                      ) : (
                        <Button
                          variant="secondary"
                          loading={busyId === entry.id}
                          aria-label={`Télécharger ${entry.title}`}
                          onClick={() => requestDownload(entry)}
                        >
                          Télécharger
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={catalogue.totalPages} hrefFor={acquisitionUrl} label="Pagination du catalogue d’acquisition" />
        </>
      )}

      {dialog && (
        <RightsModal notice={rights} entry={dialog.entry} onAccept={() => accept(dialog.entry)} onClose={() => setDialog(null)} />
      )}
    </section>
  )
}
