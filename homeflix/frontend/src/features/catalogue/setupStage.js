const STAGE_BY_JOB_STATE = { RUNNING: 'running', COMPLETED: 'noFilm', FAILED: 'failed' }

/**
 * Étape de la configuration d'une bibliothèque vide : `folder` (aucun dossier actif), puis d'après la dernière
 * indexation `index` (à lancer), `running`, `failed` ou `noFilm` (terminée sans rien trouver).
 * @param {{enabled: boolean}[]} roots
 * @param {{state: string}} job
 */
export const setupStage = (roots, job) =>
  roots.some((root) => root.enabled) ? (STAGE_BY_JOB_STATE[job.state] ?? 'index') : 'folder'
