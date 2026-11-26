// Messages affichables à l'utilisateur, choisis d'après le `code` du problem+json (docs/api/CONVENTIONS.md).
// Le champ `detail` du serveur n'est jamais affiché : il est informatif et peut être technique.

const BY_CODE = {
  VALIDATION_ERROR: 'Certaines informations sont invalides. Vérifiez les champs signalés.',
  AUTH_INVALID_CREDENTIALS: 'Identifiant ou mot de passe incorrect.',
  SESSION_EXPIRED: 'Votre session a expiré. Reconnectez-vous pour continuer.',
  TICKET_EXPIRED: 'Le lien de lecture a expiré. Relancez la lecture.',
  ACCOUNT_DISABLED: 'Ce compte est désactivé. Contactez l’administrateur.',
  ACCESS_DENIED: 'Vous n’avez pas les droits nécessaires pour cette action.',
  NOT_FOUND: 'Cet élément est introuvable. Il a peut-être été supprimé.',
  SETUP_TOKEN_INVALID: 'Le code d’installation est incorrect.',
  SETUP_ALREADY_DONE: 'L’installation est déjà terminée. Connectez-vous.',
  LAST_ADMIN: 'Il doit toujours rester au moins un administrateur.',
  PROFILE_LIMIT_REACHED: 'Le nombre maximal de profils est atteint.',
  PROFILE_NOT_SELECTED: 'Choisissez d’abord un profil.',
  CONFLICT: 'Cette action n’est pas possible dans l’état actuel. Actualisez la page et réessayez.',
  RATE_LIMITED: 'Trop de tentatives. Patientez un instant avant de réessayer.',
  ROOT_NOT_FOUND: 'Ce dossier est introuvable. Vérifiez le chemin et que le dossier est bien monté.',
  ROOT_NOT_READABLE: 'HomeFlix n’a pas le droit de lire ce dossier. Vérifiez ses permissions.',
  ROOT_NOT_A_DIRECTORY: 'Ce chemin est un fichier, pas un dossier.',
  ROOT_NOT_ALLOWED: 'Ce dossier n’est pas dans un emplacement autorisé : choisissez un dossier situé sous /media ou /downloads.',
  ROOT_OVERLAP: 'Ce dossier chevauche un dossier déjà configuré.',
  INDEX_ALREADY_RUNNING: 'Une indexation est déjà en cours.',
  MEDIA_FILE_MISSING: 'Le fichier de ce film est introuvable.',
  MEDIA_UNAVAILABLE: 'Ce film n’est pas disponible pour le moment.',
  MEDIA_UNSUPPORTED_FORMAT: 'Le format de cette vidéo n’est pas pris en charge.',
  // Propres au lecteur (erreurs de la balise <video>, sans code serveur).
  MEDIA_DECODE_FAILED: 'Cette vidéo ne peut pas être lue : le fichier semble endommagé.',
  MEDIA_PLAYBACK_FAILED: 'La lecture a échoué. Réessayez dans un instant.',
  RIGHTS_NOT_ACKNOWLEDGED: 'Confirmez d’abord le rappel des droits avant de télécharger.',
  DOWNLOAD_ALREADY_ACTIVE: 'Un téléchargement est déjà en cours pour ce contenu.',
  TORRENT_CLIENT_UNAVAILABLE: 'Le service de téléchargement est injoignable. Réessayez plus tard.',
  LIBRARY_UNAVAILABLE: 'La bibliothèque est momentanément indisponible. Réessayez plus tard.',
  IDENTITY_UNAVAILABLE: 'Le service d’authentification est momentanément indisponible. Réessayez dans un instant.',
  INTERNAL_ERROR: 'Une erreur est survenue de notre côté. Réessayez dans un instant.',
  NETWORK_ERROR: 'Impossible de joindre le serveur. Vérifiez votre connexion.',
}

// Réponses sans problem+json (ex. page d'erreur du reverse proxy) : message d'après le statut.
const BY_STATUS = {
  401: 'SESSION_EXPIRED',
  403: 'ACCESS_DENIED',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
}
const UNAVAILABLE = 'Le service est momentanément indisponible. Réessayez dans un instant.'
const GENERIC = 'Une erreur est survenue. Réessayez dans un instant.'

// Valeurs de `errorCode` d'un téléchargement FAILED : ce ne sont pas des erreurs HTTP.
const DOWNLOAD_FAILURES = {
  NO_PEERS: 'Aucune source n’est disponible pour ce fichier pour le moment.',
  DISK_FULL: 'L’espace disque est insuffisant pour ce téléchargement.',
  TORRENT_CLIENT_UNAVAILABLE: BY_CODE.TORRENT_CLIENT_UNAVAILABLE,
}

/** Codes d'erreur métier pour lesquels un message est défini. */
export const KNOWN_CODES = Object.keys(BY_CODE)

/**
 * Message français pour une erreur d'API.
 * @param {string|undefined} code Code du problem+json.
 * @param {number} status Statut HTTP (0 pour une erreur réseau).
 */
export function userMessage(code, status) {
  if (code && BY_CODE[code]) return BY_CODE[code]
  if (BY_STATUS[status]) return BY_CODE[BY_STATUS[status]]
  if (status >= 500) return UNAVAILABLE
  return GENERIC
}

/** Message français pour le `errorCode` d'un téléchargement échoué. */
export function downloadFailureMessage(errorCode) {
  return DOWNLOAD_FAILURES[errorCode] ?? GENERIC
}
