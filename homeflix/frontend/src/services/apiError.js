import { userMessage } from '@/services/errorMessages'

/**
 * Erreur de l'API. `message` est toujours un texte français affichable tel quel : il vient du `code`
 * du problem+json, jamais du `detail` (potentiellement technique).
 *
 * - `status` : statut HTTP (0 = serveur injoignable).
 * - `code` : code métier stable (`SESSION_EXPIRED`, `NOT_FOUND`…), absent si la réponse n'est pas un problem+json.
 * - `fieldErrors` : `{ champ: message }` pour `VALIDATION_ERROR`, à afficher sous chaque champ.
 * - `retryAfter` : secondes à attendre avant de réessayer (réponse 429).
 */
export class ApiError extends Error {
  constructor(status, code, { fieldErrors, retryAfter } = {}) {
    super(userMessage(code, status))
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fieldErrors = Array.isArray(fieldErrors)
      ? Object.fromEntries(fieldErrors.map(({ field, message }) => [field, message]))
      : {}
    this.retryAfter = retryAfter
  }
}
