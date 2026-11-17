import './Spinner.css'

/**
 * Indicateur de chargement. Annoncé aux lecteurs d'écran via `role="status"`.
 * @param {object} props
 * @param {string} [props.label] Texte annoncé (masqué visuellement).
 * @param {'sm'|'md'|'lg'} [props.size] Taille du cercle.
 */
export default function Spinner({ label = 'Chargement…', size = 'md' }) {
  return (
    <span className={`spinner spinner--${size}`} role="status">
      <span className="spinner__circle" aria-hidden="true" />
      <span className="visually-hidden">{label}</span>
    </span>
  )
}
