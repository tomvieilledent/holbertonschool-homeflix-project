import '@/features/catalogue/MovieCard.css'

const BADGES = {
  AVAILABLE: { label: 'Disponible', icon: '✓' },
  UNAVAILABLE: { label: 'Indisponible', icon: '✕' },
  DOWNLOADING: { label: 'En téléchargement', icon: '↓' },
}

/**
 * Badge de disponibilité d'un média. L'état est toujours dit en texte (et répété par une icône
 * décorative) : la couleur seule ne porte jamais l'information.
 * @param {object} props
 * @param {'AVAILABLE'|'UNAVAILABLE'|'DOWNLOADING'} props.availability
 */
export default function AvailabilityBadge({ availability }) {
  const badge = BADGES[availability]
  if (!badge) return null
  return (
    <span className={`availability-badge availability-badge--${availability.toLowerCase()}`}>
      <span aria-hidden="true">{badge.icon}</span> {badge.label}
    </span>
  )
}
