# API interne de Library (`/internal/**`)

Appels de service à service (ADR 0001, décision 6). **Jamais exposée à l'extérieur** : le reverse proxy répond 404 à
tout chemin `/internal` (avec ou sans préfixe `/api/<service>`).

## Authentification

- En-tête `X-Internal-Key` égal au secret partagé `INTERNAL_API_KEY`, comparé en temps constant.
- Refus par défaut : sans secret configuré côté Library, tout appel est refusé.
- Sans en-tête ou avec un mauvais secret : **401** (`problem+json`). Un jeton JWT utilisateur ne donne aucun accès.
- Les routes `/api/v1/**` n'acceptent jamais ce secret.

## Routes

Corps JSON, réponses `problem+json` en cas d'erreur (codes de `CONVENTIONS.md`).

### `POST /internal/purge` — Identity
Supprime favoris et progression, jamais les médias ni les fichiers. Idempotent.

| Corps | Effet |
|---|---|
| `{"scope":"PROFILE","profileId":"<uuid>"}` | données d'un profil (suppression d'un profil) |
| `{"scope":"ACCOUNT","accountId":"<uuid>"}` | données de tous les profils d'un compte (suppression d'un compte) |

Réponses : `204` ; `400` si la cible manque ou `scope` est inconnu.

### `POST /internal/downloads` — Acquisition (téléchargement démarré)
`{"relativePath":"complete/film.mp4","title":"Film libre"}` — `relativePath` est relatif au dossier de téléchargements
(jamais absolu, sans `..`) ; `title` est optionnel. Crée l'entrée au statut `DOWNLOADING` (ou renvoie l'existante).

Réponses : `200 {"mediaId":"<uuid>"}` ; `400` chemin invalide ; `409` dossier de téléchargements non déclaré ou entrée retirée.

### `POST /internal/downloads/completed` — Acquisition (téléchargement terminé)
Même corps. Le fichier doit exister dans le dossier de téléchargements (liens symboliques hors dossier refusés) et être
une vidéo (`mp4`, `mkv`, `webm`). L'entrée passe à `AVAILABLE` (créée si besoin). Idempotent.

Réponses : `200 {"mediaId":"<uuid>"}` ; `404 MEDIA_FILE_MISSING` ; `400` chemin invalide ; `409`.

### `POST /internal/reindex` — Acquisition
Lance l'indexation de tous les dossiers autorisés. Si une indexation tourne déjà, son état est renvoyé (pas d'erreur).
Réponse : `202` avec l'état d'indexation.

## Configuration

| Variable | Rôle |
|---|---|
| `INTERNAL_API_KEY` | secret partagé (identique chez l'appelant) |
| `DOWNLOADS_ROOT` | dossier de téléchargements, à déclarer comme dossier autorisé (`/downloads` par défaut) |
