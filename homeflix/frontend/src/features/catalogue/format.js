import { formatClock } from '@/features/player/playerUtils'

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

/**
 * Action de lecture proposée d'après la progression du profil : « Lecture », « Reprendre à 5:12 » ou « Revoir ».
 * @param {{state?: string, positionSeconds?: number}|null|undefined} progress
 * @returns {{label: string, startAt: number}} Libellé du bouton et position de départ en secondes.
 */
export function playAction(progress) {
  if (progress?.state === 'STARTED' && progress.positionSeconds > 0) {
    return { label: `Reprendre à ${formatClock(progress.positionSeconds)}`, startAt: progress.positionSeconds }
  }
  if (progress?.state === 'COMPLETED') return { label: 'Revoir', startAt: 0 }
  return { label: 'Lecture', startAt: 0 }
}
