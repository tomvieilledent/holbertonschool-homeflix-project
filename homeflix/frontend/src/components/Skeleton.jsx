import './Skeleton.css'

/**
 * Silhouette de chargement. Décorative (`aria-hidden`) sauf si `label` est fourni : le bloc est alors
 * annoncé comme un statut occupé. Une seule silhouette par zone doit porter un `label`.
 * @param {object} props
 * @param {'text'|'rect'|'circle'} [props.variant] Forme.
 * @param {number} [props.lines] Nombre de lignes (variante `text`).
 * @param {string|number} [props.width] Largeur CSS (nombre = px).
 * @param {string|number} [props.height] Hauteur CSS (nombre = px).
 * @param {string} [props.label] Texte annoncé aux lecteurs d'écran (ex. « Chargement du catalogue »).
 */
export default function Skeleton({ variant = 'text', lines = 1, width, height, label }) {
  const size = { width, height }
  const count = variant === 'text' ? lines : 1
  const shapes = Array.from({ length: count }, (_, index) => (
    <span
      key={index}
      className={`skeleton skeleton--${variant}`}
      style={index === count - 1 && count > 1 ? { ...size, width: width ?? '60%' } : size}
      aria-hidden="true"
    />
  ))

  if (!label) return <span className="skeleton-group skeleton-group--decorative">{shapes}</span>

  return (
    <span className="skeleton-group" role="status" aria-busy="true">
      {shapes}
      <span className="visually-hidden">{label}</span>
    </span>
  )
}
