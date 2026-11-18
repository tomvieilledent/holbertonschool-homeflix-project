/**
 * Durée lisible : `596` → « 9 min », `5400` → « 1 h 30 ». Chaîne vide si la durée est inconnue.
 * @param {number|null|undefined} seconds
 */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  const totalMinutes = Math.max(1, Math.round(seconds / 60))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes} min`
  return minutes === 0 ? `${hours} h` : `${hours} h ${String(minutes).padStart(2, '0')}`
}
