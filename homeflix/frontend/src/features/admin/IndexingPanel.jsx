import Button from '@/components/Button'
import Spinner from '@/components/Spinner'
import useIndexJob from '@/features/admin/useIndexJob'
import '@/features/admin/IndexingPanel.css'

const COUNTERS = [
  { key: 'scanned', label: 'Analysés' },
  { key: 'added', label: 'Ajoutés' },
  { key: 'updated', label: 'Mis à jour' },
  { key: 'markedUnavailable', label: 'Manquants' },
  { key: 'duplicates', label: 'Doublons' },
  { key: 'errors', label: 'Erreurs' },
]

const plural = (count, singular, pluralForm) => `${count} ${count > 1 ? pluralForm : singular}`
const formatTime = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

/** Phrase de résultat d'un scan terminé : ce qui a changé, et ce qui mérite attention. */
function summary(job) {
  const parts = [
    plural(job.added ?? 0, 'film ajouté', 'films ajoutés'),
    `${job.updated ?? 0} mis à jour`,
    plural(job.markedUnavailable ?? 0, 'manquant', 'manquants'),
  ]
  return `${parts.join(', ')}.`
}

/** Phrase d'état, annoncée aux lecteurs d'écran ; elle ne change qu'au changement d'état (pas à chaque consultation). */
function statusText(job, stalled) {
  if (stalled) return 'Le suivi de l’indexation est interrompu : la connexion au serveur est instable.'
  switch (job.state) {
    case 'RUNNING':
      return 'Indexation en cours…'
    case 'COMPLETED':
      return `Indexation terminée${job.finishedAt ? ` à ${formatTime(job.finishedAt)}` : ''}. ${summary(job)}`
    case 'FAILED':
      return 'L’indexation a échoué. Vérifiez les dossiers configurés puis relancez-la.'
    default:
      return 'Aucune indexation n’a encore été lancée.'
  }
}

/**
 * Lancement et suivi de l'indexation manuelle : le bouton est désactivé pendant un scan, la progression se met à jour
 * seule (analysés, ajoutés, mis à jour, manquants, doublons, erreurs) et le résultat final reste affiché.
 */
export default function IndexingPanel() {
  const { job, loadError, starting, startError, stalled, running, start, resume } = useIndexJob()

  return (
    <section className="indexing" aria-labelledby="indexing-title">
      <h3 id="indexing-title">Indexation</h3>
      <p className="indexing__hint">
        L’indexation recherche les films dans les dossiers ci-dessus. Vous pouvez la relancer sans risque : les films
        déjà connus ne sont pas dupliqués.
      </p>

      <div className="indexing__actions">
        <Button onClick={start} busy={running} disabled={job === null} loading={starting}>
          Lancer l’indexation
        </Button>
        {running && !starting && (
          <span className="indexing__busy">
            <Spinner size="sm" label="Indexation en cours" /> Une indexation est en cours.
          </span>
        )}
        {stalled && <Button variant="secondary" onClick={resume}>Reprendre le suivi</Button>}
      </div>

      {startError && <p role="alert">{startError}</p>}
      {loadError && <p role="alert">{loadError.message}</p>}

      {job && (
        <div className="indexing__result">
          <p role="status" className={job.state === 'FAILED' ? 'indexing__failed' : undefined}>
            {statusText(job, stalled)}
          </p>
          {job.state !== 'IDLE' && (
            <dl className="indexing__counters">
              {COUNTERS.map(({ key, label }) => (
                <div key={key} className={key === 'errors' && job[key] > 0 ? 'indexing__counter indexing__counter--alert' : 'indexing__counter'}>
                  <dt>{label}</dt>
                  <dd>{job[key] ?? 0}</dd>
                </div>
              ))}
            </dl>
          )}
          {job.state === 'COMPLETED' && job.errors > 0 && (
            <p>
              {plural(job.errors, 'fichier n’a pas pu être lu', 'fichiers n’ont pas pu être lus')} : vérifiez qu’ils ne
              sont pas corrompus et que HomeFlix a le droit de les lire.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
