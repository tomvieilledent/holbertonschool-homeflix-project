// Formulaire d'édition des métadonnées d'un média : limites du contrat (`MediaMetadataUpdate`), validation côté client
// (le serveur reste l'autorité) et calcul des seules modifications à envoyer.

export const TITLE_MAX = 200
export const DESCRIPTION_MAX = 2000
export const GENRES_MAX = 10
export const GENRE_MAX_LENGTH = 40
export const YEAR_MIN = 1888
export const YEAR_MAX = 2100

/** Valeurs de départ du formulaire à partir d'un média. */
export const initialValues = (media) => ({
  title: media.title,
  description: media.description ?? '',
  genres: (media.genres ?? []).join(', '),
  year: media.year == null ? '' : String(media.year),
})

/** Genres saisis séparés par des virgules : espaces retirés, vides et doublons (casse ignorée) écartés. */
export function parseGenres(text) {
  const seen = new Set()
  const genres = []
  for (const part of text.split(',')) {
    const genre = part.trim()
    const key = genre.toLocaleLowerCase('fr')
    if (genre && !seen.has(key)) {
      seen.add(key)
      genres.push(genre)
    }
  }
  return genres
}

/**
 * Erreurs de saisie, `{ champ: message }` (vide si tout est valide). Une année vide est valide : elle reste inchangée
 * (le contrat ne permet pas de l'effacer).
 */
export function validateMetadata({ title, description, genres, year }) {
  const errors = {}
  const trimmed = title.trim()
  if (!trimmed) errors.title = 'Le titre est obligatoire.'
  else if (trimmed.length > TITLE_MAX) errors.title = `Le titre ne doit pas dépasser ${TITLE_MAX} caractères.`

  if (description.length > DESCRIPTION_MAX) {
    errors.description = `La description ne doit pas dépasser ${DESCRIPTION_MAX} caractères.`
  }

  const list = parseGenres(genres)
  const tooLong = list.find((genre) => genre.length > GENRE_MAX_LENGTH)
  if (list.length > GENRES_MAX) errors.genres = `${GENRES_MAX} genres au maximum.`
  else if (tooLong) errors.genres = `Le genre « ${tooLong} » dépasse ${GENRE_MAX_LENGTH} caractères.`

  if (year.trim() !== '') {
    const value = Number(year)
    if (!Number.isInteger(value) || value < YEAR_MIN || value > YEAR_MAX) {
      errors.year = `L’année doit être un nombre entier entre ${YEAR_MIN} et ${YEAR_MAX}.`
    }
  }
  return errors
}

/**
 * Modifications à envoyer (`PATCH`) : seuls les champs qui ont changé. `{}` si rien n'a changé.
 * @param {object} media Média d'origine.
 * @param {{title: string, description: string, genres: string, year: string}} values Valeurs du formulaire (valides).
 */
export function changesFrom(media, values) {
  const changes = {}
  const title = values.title.trim()
  if (title !== media.title) changes.title = title

  const description = values.description.trim()
  if (description !== (media.description ?? '').trim()) changes.description = description

  const genres = parseGenres(values.genres)
  const before = media.genres ?? []
  if (genres.length !== before.length || genres.some((genre, index) => genre !== before[index])) changes.genres = genres

  if (values.year.trim() !== '' && Number(values.year) !== media.year) changes.year = Number(values.year)
  return changes
}
