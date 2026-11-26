/** URL de `base` qui mémorise la destination demandée (`?next=`), sauf pour l'accueil. */
const withNext = (base, { pathname, search = '', hash = '' }) => {
  const next = `${pathname}${search}${hash}`
  return next === '/' ? base : `${base}?next=${encodeURIComponent(next)}`
}

/** Écran de remplacement d'un mot de passe temporaire. */
export const PASSWORD_PATH = '/nouveau-mot-de-passe'

/**
 * URL de connexion qui mémorise la destination demandée. L'écran de changement de mot de passe n'en est pas une : la
 * garde y ramène d'elle-même si le compte en a encore besoin.
 */
export const loginUrl = (location) =>
  location.pathname === PASSWORD_PATH ? '/login' : withNext('/login', location)

/** URL du choix de profil qui mémorise la destination demandée. */
export const profilesUrl = (location) => withNext('/profiles', location)

/** URL de l'écran de changement de mot de passe, qui mémorise la destination demandée. */
export const passwordUrl = (location) => withNext(PASSWORD_PATH, location)

/**
 * Destination après connexion, limitée aux chemins internes : refuse les URL absolues, les URL
 * relatives au protocole (`//autre-site`) et la boucle vers `/login` (évite la redirection ouverte).
 * Les caractères de contrôle sont refusés aussi : le navigateur retire tabulations et retours à la ligne, ce qui
 * transforme `/<tab>/autre-site` en `//autre-site`.
 * @param {string|null|undefined} value Valeur brute du paramètre `next`.
 * @returns {string} Chemin interne sûr ; `/` par défaut.
 */
export function safeNext(value) {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    /\p{Cc}/u.test(value) ||
    value === '/login' ||
    value.startsWith('/login?') ||
    value.startsWith('/login#')
  ) {
    return '/'
  }
  return value
}
