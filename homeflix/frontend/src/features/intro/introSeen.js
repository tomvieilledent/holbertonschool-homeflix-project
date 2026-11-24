/** Clé de `sessionStorage` : l'intro n'est jouée qu'une fois par session de navigation. */
export const INTRO_SEEN_KEY = 'homeflix:intro-seen'

export function hasSeenIntro() {
  try {
    return sessionStorage.getItem(INTRO_SEEN_KEY) === '1'
  } catch {
    return false // stockage indisponible : l'intro rejouera à chaque visite de /login, sans conséquence
  }
}

export function markIntroSeen() {
  try {
    sessionStorage.setItem(INTRO_SEEN_KEY, '1')
  } catch {
    // stockage indisponible : voir hasSeenIntro
  }
}

/** `true` si le visiteur a demandé moins d'animations (réglage du système) : l'intro est alors sautée. */
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)
