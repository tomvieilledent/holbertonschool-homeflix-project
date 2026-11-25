import { useCallback, useEffect, useState } from 'react'
import Button from '@/components/Button'
import ErrorState from '@/components/ErrorState'
import Skeleton from '@/components/Skeleton'
import { isAbortError } from '@/services/api'
import { getSystemStatus } from '@/services/system'
import '@/features/admin/ServicesPage.css'

/** Libellés des services connus ; un nom inconnu s'affiche tel quel. */
const SERVICE_LABELS = {
  identity: 'Identity — comptes et sessions',
  library: 'Library — médiathèque et lecture',
  acquisition: 'Acquisition — téléchargements',
}

/** Chaque état a un libellé, un pictogramme et une classe : jamais la couleur seule. */
const STATES = {
  UP: { label: 'Opérationnel', glyph: '✓', className: 'services__state--up' },
  DOWN: { label: 'Hors service', glyph: '✕', className: 'services__state--down' },
  DEGRADED: { label: 'Dégradé', glyph: '!', className: 'services__state--degraded' },
}

function StateBadge({ status }) {
  const state = STATES[status] ?? { label: status, glyph: '?', className: 'services__state--degraded' }
  return (
    <span className={`services__state ${state.className}`}>
      <span aria-hidden="true">{state.glyph}</span> {state.label}
    </span>
  )
}

const formatChecked = (iso) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'medium' })

/**
 * État des services (ADMIN) : l'état global et celui d'Identity, Library et Acquisition, relevés par Identity à
 * l'ouverture de la page puis à la demande. Une requête qui échoue signifie qu'Identity lui-même est injoignable : on
 * l'affiche comme telle, sans inventer l'état des autres services.
 */
export default function ServicesPage() {
  const [status, setStatus] = useState(null) // null = chargement
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback((signal) => {
    setRefreshing(true)
    setError(null)
    return getSystemStatus(signal)
      .then(setStatus)
      .catch((failure) => {
        if (!isAbortError(failure)) setError(failure)
      })
      .finally(() => {
        if (!signal?.aborted) setRefreshing(false)
      })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  if (error && !status) {
    return (
      <section className="services">
        <h2>Services</h2>
        <ErrorState
          title="État des services indisponible"
          description={`${error.message} Si le service Identity est à l’arrêt, l’état des autres services ne peut pas être relevé.`}
          onRetry={() => load()}
        />
      </section>
    )
  }

  return (
    <section className="services">
      <div className="services__header">
        <h2>Services</h2>
        <Button variant="secondary" onClick={() => load()} busy={refreshing} disabled={!status}>
          {refreshing && status ? 'Actualisation…' : 'Actualiser'}
        </Button>
      </div>

      {!status ? (
        <>
          <span role="status" className="visually-hidden">
            Chargement de l’état des services
          </span>
          <div className="services__skeleton" aria-hidden="true">
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} variant="rect" width="100%" height={48} />
            ))}
          </div>
        </>
      ) : (
        <>
          {error && (
            <p role="alert" className="services__error">
              Actualisation impossible : {error.message} Les valeurs ci-dessous datent du dernier relevé.
            </p>
          )}
          <p className="services__overall">
            État général : <StateBadge status={status.status} />
          </p>
          <ul className="services__list" aria-label="Services">
            {status.services.map((service) => (
              <li key={service.name} className="services__item">
                <span>{SERVICE_LABELS[service.name] ?? service.name}</span>
                <StateBadge status={service.status} />
              </li>
            ))}
          </ul>
          <p className="services__checked">Relevé du {formatChecked(status.checkedAt)}</p>
        </>
      )}
    </section>
  )
}
