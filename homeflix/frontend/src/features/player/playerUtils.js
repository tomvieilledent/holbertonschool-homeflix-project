const wholeSeconds = (seconds) => (Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0)

/** Durée affichée : `62` → « 1:02 », `3723` → « 1:02:03 ». */
export function formatClock(seconds) {
  const total = wholeSeconds(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = String(total % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`
}

const unit = (value, singular) => `${value} ${singular}${value > 1 ? 's' : ''}`

/** Durée dite aux lecteurs d'écran : `3723` → « 1 heure 2 minutes 3 secondes ». */
export function spokenDuration(seconds) {
  const total = wholeSeconds(seconds)
  const parts = [
    [Math.floor(total / 3600), 'heure'],
    [Math.floor((total % 3600) / 60), 'minute'],
    [total % 60, 'seconde'],
  ]
    .filter(([value]) => value > 0)
    .map(([value, name]) => unit(value, name))
  return parts.length > 0 ? parts.join(' ') : '0 seconde'
}

/** Borne `value` entre `min` et `max`. */
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
