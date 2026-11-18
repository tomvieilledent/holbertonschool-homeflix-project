/** URL de connexion qui mémorise la destination demandée (`?next=`), sauf pour l'accueil. */
export function loginUrl({ pathname, search = '', hash = '' }) {
  const next = `${pathname}${search}${hash}`
  return next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`
}

/**
 * Destination après connexion, limitée aux chemins internes : refuse les URL absolues, les URL
 * relatives au protocole (`//autre-site`) et la boucle vers `/login` (évite la redirection ouverte).
 * @param {string|null|undefined} value Valeur brute du paramètre `next`.
 * @returns {string} Chemin interne sûr ; `/` par défaut.
 */
export function safeNext(value) {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    value === '/login' ||
    value.startsWith('/login?') ||
    value.startsWith('/login#')
  ) {
    return '/'
  }
  return value
}
