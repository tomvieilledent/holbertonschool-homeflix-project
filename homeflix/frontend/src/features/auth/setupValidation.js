export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MAX_LENGTH = 128

/** Message d'erreur d'un mot de passe trop court ou trop long, ou `''` s'il est valide. */
export function passwordError(password) {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Le mot de passe ne doit pas dépasser ${PASSWORD_MAX_LENGTH} caractères.`
  }
  return ''
}

/**
 * Validation côté client (le serveur reste l'autorité). Retourne `{ champ: message }`, vide si valide.
 * @param {{setupToken: string, username: string, email: string, password: string, confirmation: string}} values
 */
export function validateSetup({ setupToken, username, email, password, confirmation }) {
  const errors = {}
  if (!setupToken.trim()) errors.setupToken = 'Saisissez le code d’installation.'
  if (username.trim().length < 3 || username.trim().length > 40) {
    errors.username = 'L’identifiant doit contenir entre 3 et 40 caractères.'
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Saisissez une adresse e-mail valide.'
  const passwordProblem = passwordError(password)
  if (passwordProblem) errors.password = passwordProblem
  if (!errors.password && confirmation !== password) {
    errors.confirmation = 'Les mots de passe ne correspondent pas.'
  }
  return errors
}
