import { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '@/components/Button'
import ConfirmModal from '@/components/ConfirmModal'
import DataTable from '@/components/DataTable'
import { downloadFailureMessage } from '@/services/errorMessages'
import '@/features/admin/DownloadsPanel.css'

/** Les cinq états d'un téléchargement : texte, symbole (non coloré, pour ne pas dépendre de la seule couleur) et classe. */
export const DOWNLOAD_STATES = {
  QUEUED: { label: 'En file d’attente', glyph: '…' },
  DOWNLOADING: { label: 'En cours', glyph: '↓' },
  COMPLETED: { label: 'Terminé', glyph: '✓' },
  FAILED: { label: 'Échoué', glyph: '!' },
  CANCELLED: { label: 'Annulé', glyph: '–' },
}

/** Un téléchargement est actif tant qu'il est en file ou en cours : c'est ce qui justifie de le suivre. */
export const isActiveDownload = (download) => download.state === 'QUEUED' || download.state === 'DOWNLOADING'

const formatDate = (iso) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

/** État d'un téléchargement : symbole, texte et couleur distincts pour chacun. */
export function DownloadState({ state }) {
  const { label, glyph } = DOWNLOAD_STATES[state] ?? { label: 'Inconnu', glyph: '?' }
  return (
    <span className={`download-state download-state--${String(state).toLowerCase()}`}>
      <span aria-hidden="true">{glyph}</span> {label}
    </span>
  )
}

/**
 * Suivi des téléchargements : états, progression et annulation (confirmée). Le tableau se met à jour seul tant qu'un
 * téléchargement est actif (voir `usePolling`) et s'arrête ensuite. Une erreur de téléchargement est expliquée en
 * français, sans détail technique.
 * @param {object} props
 * @param {{items: object[], total: number}} props.downloads Page de téléchargements.
 * @param {boolean} props.stalled Le suivi automatique est interrompu.
 * @param {() => void} props.onResume Reprend le suivi.
 * @param {(download: object) => Promise<void>} props.onCancel Annule un téléchargement (lève en cas d'échec).
 */
export default function DownloadsPanel({ downloads, stalled, onResume, onCancel }) {
  const [target, setTarget] = useState(null)
  const { items, total } = downloads
  const columns = [
    { key: 'title', header: 'Titre', rowHeader: true, render: (download) => download.title },
    {
      key: 'state',
      header: 'État',
      render: (download) => (
        <>
          <DownloadState state={download.state} />
          {download.state === 'FAILED' && <p className="downloads__error">{downloadFailureMessage(download.errorCode)}</p>}
        </>
      ),
    },
    {
      key: 'progress',
      header: 'Progression',
      render: (download) => (
        <div className="downloads__progress">
          <progress max={100} value={download.progressPercent} aria-label={`Progression de « ${download.title} »`} />
          <span>{download.progressPercent} %</span>
        </div>
      ),
    },
    { key: 'created', header: 'Lancé', render: (download) => formatDate(download.createdAt) },
    {
      key: 'actions',
      header: 'Actions',
      render: (download) => (
        <>
          {isActiveDownload(download) && (
            <Button variant="danger" aria-label={`Annuler le téléchargement de ${download.title}`} onClick={() => setTarget(download)}>
              Annuler
            </Button>
          )}
          {download.state === 'COMPLETED' && download.libraryMediaId && (
            <Link to={`/media/${encodeURIComponent(download.libraryMediaId)}`} aria-label={`Voir dans la bibliothèque : ${download.title}`}>
              Voir dans la bibliothèque
            </Link>
          )}
        </>
      ),
    },
  ]

  return (
    <section className="downloads" aria-labelledby="downloads-title">
      <h3 id="downloads-title">Téléchargements</h3>

      {stalled && (
        <p role="alert" className="downloads__stalled">
          Le suivi des téléchargements est interrompu : la connexion au serveur est instable.{' '}
          <Button variant="secondary" onClick={onResume}>
            Reprendre le suivi
          </Button>
        </p>
      )}

      {items.length === 0 ? (
        <p className="downloads__empty">Aucun téléchargement pour le moment. Lancez-en un depuis le catalogue ci-dessus.</p>
      ) : (
        <>
          <DataTable
            caption="Téléchargements, du plus récent au plus ancien"
            columns={columns}
            rows={items}
            rowProps={(download) => ({ 'data-state': download.state })}
          />
          {total > items.length && (
            <p className="downloads__empty">
              Les {items.length} téléchargements les plus récents sont affichés ({total} au total).
            </p>
          )}
        </>
      )}

      {target && (
        <ConfirmModal
          title={`Annuler le téléchargement de « ${target.title} » ?`}
          confirmLabel="Annuler le téléchargement"
          cancelLabel="Garder le téléchargement"
          onConfirm={async () => {
            await onCancel(target)
            setTarget(null)
          }}
          onClose={() => setTarget(null)}
        >
          <p>
            Le téléchargement sera arrêté et les données reçues en partie seront supprimées. Un fichier déjà reçu en
            entier reste sur le serveur.
          </p>
          <p>
            Aucun film de la bibliothèque n’est supprimé. Vous pourrez relancer le téléchargement depuis le catalogue
            ci-dessus.
          </p>
        </ConfirmModal>
      )}
    </section>
  )
}
