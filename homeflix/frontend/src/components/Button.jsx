import Spinner from '@/components/Spinner'
import './Button.css'

/**
 * Bouton accessible. Natif `<button>` : Entrée et Espace fonctionnent, focus visible via les tokens.
 * Pendant `loading`, le bouton est inactif (`aria-disabled`, clics ignorés) mais reste focalisable.
 * @param {object} props
 * @param {'primary'|'secondary'|'ghost'|'danger'} [props.variant]
 * @param {boolean} [props.loading] Affiche un spinner et bloque les clics.
 * @param {boolean} [props.disabled] Désactive le bouton.
 * @param {'button'|'submit'|'reset'} [props.type] Par défaut `button` (évite les soumissions involontaires).
 * @param {(event: MouseEvent) => void} [props.onClick]
 * @param {React.ReactNode} props.children
 */
export default function Button({
  variant = 'primary',
  loading = false,
  disabled = false,
  type = 'button',
  onClick,
  children,
  className = '',
  ...rest
}) {
  const handleClick = (event) => {
    if (loading) {
      event.preventDefault()
      return
    }
    onClick?.(event)
  }

  return (
    <button
      type={type}
      className={`btn btn--${variant} ${className}`.trim()}
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      onClick={handleClick}
      {...rest}
    >
      {loading && <Spinner size="sm" label="Chargement…" />}
      <span>{children}</span>
    </button>
  )
}
