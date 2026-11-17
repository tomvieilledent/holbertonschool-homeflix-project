import Button from '@/components/Button'
import '@/components/StateMessage.css'

/**
 * État d'erreur compréhensible, sans détail technique (pas de message d'exception, de code ni de trace).
 * Annoncé aux lecteurs d'écran via `role="alert"`.
 * @param {object} props
 * @param {string} [props.title] Titre de l'erreur.
 * @param {string} [props.description] Explication et piste pour avancer.
 * @param {() => void} [props.onRetry] Si fourni, affiche le bouton « Réessayer ».
 * @param {string} [props.retryLabel] Libellé du bouton de nouvel essai.
 * @param {React.ReactNode} [props.children] Actions supplémentaires (ex. « Retour à la fiche »).
 */
export default function ErrorState({
  title = 'Une erreur est survenue',
  description = 'Quelque chose s’est mal passé. Réessayez dans un instant.',
  onRetry,
  retryLabel = 'Réessayer',
  children,
}) {
  return (
    <section className="state state--error" role="alert">
      <div className="state__icon" aria-hidden="true">
        !
      </div>
      <h2 className="state__title">{title}</h2>
      <p className="state__description">{description}</p>
      {(onRetry || children) && (
        <div className="state__actions">
          {onRetry && <Button onClick={onRetry}>{retryLabel}</Button>}
          {children}
        </div>
      )}
    </section>
  )
}
