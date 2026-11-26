// Profil actif retenu pour cet onglet (`sessionStorage`) : un identifiant de profil n'a rien de secret.
//
// Pourquoi : `POST /auth/refresh` conserve le profil actif de la session, mais tous les onglets partagent cette
// session. Sans cette mémoire, un onglet passerait au profil choisi en dernier dans un autre à chaque renouvellement
// du jeton. Après un refresh, le client ré-sélectionne ce profil (voir `refreshAccessToken` dans `api.js`).

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
