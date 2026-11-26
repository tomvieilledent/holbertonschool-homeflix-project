import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import '@/components/Button.css'
import EmptyState from '@/components/EmptyState'
import Spinner from '@/components/Spinner'
import { useAuth } from '@/features/auth/authContext'
import '@/features/catalogue/EmptyLibrary.css'
import { setupStage } from '@/features/catalogue/setupStage'
import { isAbortError } from '@/services/api'
import { getIndexStatus, listMediaRoots } from '@/services/library'

const STEPS = ['Ajouter le dossier qui contient vos films', 'Lancer l’indexation']

/** Ce que l'administrateur doit faire ensuite. `done` : nombre d'étapes déjà faites (absent si on l'ignore). */
const GUIDES = {
  folder: {
    title: 'Configurez votre bibliothèque',
    description: 'Indiquez à HomeFlix où sont vos films, puis lancez une indexation.',
    action: 'Ajouter un dossier',
    done: 0,
  },
  index: {
    title: 'Lancez l’indexation',
    description: 'Votre dossier est enregistré. L’indexation va y chercher vos films.',
    action: 'Ouvrir la bibliothèque',
    done: 1,
  },
  failed: {
    title: 'L’indexation a échoué',
    description: 'Vérifiez les dossiers configurés, puis relancez l’indexation.',
    action: 'Ouvrir la bibliothèque',
    done: 1,
  },
  running: {
    title: 'Indexation en cours',
    description: 'Vos films apparaîtront ici à la fin. Rechargez cette page dans un instant.',
    action: 'Suivre l’indexation',
    done: 1,
  },
  noFilm: {
    title: 'Aucun film trouvé',
    description: 'Vérifiez que vos dossiers contiennent des fichiers .mp4, .mkv ou .webm, puis relancez l’indexation.',
    action: 'Vérifier la bibliothèque',
    done: 2,
  },
  unknown: {
    title: 'Votre bibliothèque est vide',
    description: 'Vérifiez les dossiers configurés, puis lancez une indexation.',
    action: 'Ouvrir la bibliothèque',
  },
}

/** Guide de l'administrateur : les deux étapes, ce qui est fait, et un lien direct vers la configuration. */
function SetupGuide() {
  const [stage, setStage] = useState(null) // null = vérification en cours

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([listMediaRoots(controller.signal), getIndexStatus(controller.signal)])
      .then(([roots, job]) => setStage(setupStage(roots, job)))
      .catch((error) => {
        if (!isAbortError(error)) setStage('unknown') // le guide reste utile sans connaître l'avancement
      })
    return () => controller.abort()
  }, [])

  if (stage === null) return <Spinner size="lg" label="Vérification de la bibliothèque…" />
  const { title, description, action, done } = GUIDES[stage]

  return (
    <EmptyState title={title} description={description}>
      <div className="empty-library">
        {done !== undefined && (
          <ol className="empty-library__steps" aria-label="Étapes de configuration">
            {STEPS.map((step, index) => (
              <li key={step} className={index < done ? 'empty-library__step--done' : undefined}>
                {step} <span className="empty-library__state">{index < done ? '✓ fait' : 'à faire'}</span>
              </li>
            ))}
          </ol>
        )}
        <Link className="btn btn--primary" to="/admin/bibliotheque">
          {action}
        </Link>
      </div>
    </EmptyState>
  )
}

/**
 * Bibliothèque sans aucun film (accueil, catalogue). L'administrateur est guidé vers la configuration et
 * l'indexation ; les autres comptes, qui n'y peuvent rien, reçoivent un message neutre.
 */
export default function EmptyLibrary() {
  const { account } = useAuth()
  if (account?.role === 'ADMIN') return <SetupGuide />
  return (
    <EmptyState
      title="Aucun film pour le moment"
      description="Les films apparaîtront ici dès que la bibliothèque sera prête."
    />
  )
}
