// Profil actif retenu pour cet onglet (`sessionStorage`) : un identifiant de profil n'a rien de secret.
//
// Pourquoi : `POST /auth/refresh` renvoie un access token sans profil actif (`pid`), alors que le contrat dit
// que le claim est conservé. Sans cette mémoire, chaque rechargement et chaque renouvellement du jeton (toutes
// les 15 min) ferait perdre le profil : les routes de la bibliothèque répondraient `PROFILE_NOT_SELECTED`.
// Après un refresh, le client ré-sélectionne ce profil (voir `refreshAccessToken` dans `api.js`).

const KEY = 'homeflix:active-profile'

/** Identifiant du profil choisi dans cet onglet, ou `null`. */
export function rememberedProfile() {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null // stockage indisponible : on retombe sur « Qui regarde ? » après un rechargement
  }
}

export function rememberProfile(profileId) {
  try {
    sessionStorage.setItem(KEY, profileId)
  } catch {
    // stockage indisponible : voir rememberedProfile
  }
}

export function forgetProfile() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // stockage indisponible : voir rememberedProfile
  }
}
