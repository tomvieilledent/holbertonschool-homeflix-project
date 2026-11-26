import { useCallback, useEffect, useState } from 'react'
import Button from '@/components/Button'
import ConfirmModal from '@/components/ConfirmModal'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import Skeleton from '@/components/Skeleton'
import AddRootModal from '@/features/admin/AddRootModal'
import IndexingPanel from '@/features/admin/IndexingPanel'
import { isAbortError } from '@/services/api'
import { addMediaRoot, deleteMediaRoot, listMediaRoots } from '@/services/library'
import '@/features/admin/LibraryPage.css'

function RootsSkeleton() {
  return (
    <>
      <span role="status" className="visually-hidden">
        Chargement des dossiers
      </span>
      <div className="library__skeleton" aria-hidden="true">
        {[0, 1].map((row) => (
          <Skeleton key={row} variant="rect" width="100%" height={64} />
        ))}
      </div>
    </>
  )
}

/**
 * Bibliothèque : configuration des dossiers médias autorisés, sans modifier le code. Un dossier se vérifie avant d'être
 * enregistré (résultat en langage clair), et son retrait demande confirmation : ses films deviennent indisponibles,
 * aucun fichier n'est supprimé.
 */
export default function LibraryPage() {
  const [roots, setRoots] = useState(null) // null = chargement
  const [error, setError] = useState(null)
  const [dialog, setDialog] = useState(null) // { type: 'add' } | { type: 'delete', root }
  const [notice, setNotice] = useState('')

  const load = useCallback((signal) => {
    setError(null)
    listMediaRoots(signal)
      .then(setRoots)
      .catch((failure) => {
        if (!isAbortError(failure)) setError(failure)
      })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const close = () => setDialog(null)
  /** Lance l'action ; en cas de succès, ferme la modale, annonce le résultat et recharge la liste. */
  const run = async (action, message) => {
    await action()
    setDialog(null)
    setNotice(message)
    load()
  }

  if (error) return <ErrorState description={error.message} onRetry={() => load()} />

  const target = dialog?.root
  return (
    <section className="library">
      <h2>Bibliothèque</h2>

      <section className="library__roots" aria-labelledby="library-roots-title">
        <div className="library__header">
          <h3 id="library-roots-title">Dossiers médias</h3>
          <Button onClick={() => setDialog({ type: 'add' })}>Ajouter un dossier</Button>
        </div>
        <p className="library__hint">
          HomeFlix ne lit que les dossiers listés ici, sous les emplacements autorisés (/media et /downloads). Aucun
          fichier n’est jamais modifié ni supprimé.
        </p>
        <div role="status" className="library__notice">
          {notice}
        </div>

        {roots === null && <RootsSkeleton />}
        {roots?.length === 0 && (
          <EmptyState
            title="Aucun dossier configuré"
            description="Ajoutez le dossier qui contient vos films pour que HomeFlix puisse les indexer."
          />
        )}
        {roots?.length > 0 && (
          <ul className="library__list">
            {roots.map((root) => (
              <li key={root.id} className="library__item">
                <div className="library__info">
                  <strong>{root.label}</strong>
                  <code className="library__path">{root.path}</code>
                  {!root.enabled && <span className="library__badge">Désactivé</span>}
                </div>
                <Button
                  variant="danger"
                  aria-label={`Retirer le dossier ${root.label}`}
                  onClick={() => setDialog({ type: 'delete', root })}
                >
                  Retirer
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <IndexingPanel />

      {dialog?.type === 'add' && (
        <AddRootModal
          onSubmit={(root) => run(() => addMediaRoot(root), `Dossier « ${root.label ?? root.path} » ajouté.`)}
          onClose={close}
        />
      )}
      {dialog?.type === 'delete' && (
        <ConfirmModal
          title={`Retirer le dossier « ${target.label} » ?`}
          confirmLabel="Retirer le dossier"
          onConfirm={() => run(() => deleteMediaRoot(target.id), `Dossier « ${target.label} » retiré.`)}
          onClose={close}
        >
          <p>
            Les films de ce dossier deviendront indisponibles dans le catalogue. Aucun fichier n’est supprimé de votre
            disque.
          </p>
          <p>
            Si vous le rajoutez plus tard, une indexation retrouvera ses films avec leurs corrections, leur place dans
            « Ma liste » et leur progression. Les films retirés du catalogue le resteront.
          </p>
        </ConfirmModal>
      )}
    </section>
  )
}
