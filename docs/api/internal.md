# Communications entre services

Tous les appels de service à service de HomeFlix : qui appelle qui, avec quelle authentification, ce qui se passe en cas de panne. Les appels passent par le réseau Docker `internal` ; le reverse proxy ne route **jamais** `/internal` ni `/actuator` (404, voir ADR 0001 et 0002). Les routes de Library sont détaillées plus bas.

## Vue d'ensemble

| # | Émetteur | Récepteur | Appel | Authentification | Délais | Si le récepteur est en panne | État |
|---|---|---|---|---|---|---|---|
| 1 | Library, Acquisition | Identity | `GET /.well-known/jwks.json` (clés publiques, mises en cache) | aucune (clés publiques) | 3 s (`IDENTITY_JWKS_TIMEOUT`) | `503 IDENTITY_UNAVAILABLE` sur la requête en cours ; un jeton déjà vérifié avec une clé en cache continue de passer | fait |
| 2 | Identity | Library | `POST /internal/purge` portée `PROFILE` (suppression d'un profil) | `X-Internal-Key` | 2 s connexion, 5 s lecture, 1 tentative | `503 LIBRARY_UNAVAILABLE` : **rien n'est supprimé**, l'appel se rejoue tel quel | fait (#59) |
| 3 | Identity | Library | `POST /internal/purge` portée `ACCOUNT` (suppression d'un compte) | `X-Internal-Key` | idem | idem | fait (#97) |
| 4 | Acquisition | Library | `POST /internal/downloads` (téléchargement démarré) | `X-Internal-Key` | 3 s, 3 essais | sans effet sur le téléchargement ; retenté au passage suivant | fait (#72, #292) |
| 5 | Acquisition | Library | `POST /internal/downloads/completed` (téléchargement terminé) | `X-Internal-Key` | 3 s, 3 essais (aucun nouvel essai après un refus `4xx`) | le téléchargement passe `FAILED` ; le fichier reste dans `/downloads`, une réindexation manuelle le reprend | fait (#72, #99) |
| 5 bis | Acquisition | Library | `POST /internal/downloads/failed` (échec ou annulation) | `X-Internal-Key` | 3 s, 3 essais | journalisé, non rejoué : l'entrée peut rester « en téléchargement » | fait (#292) |
| 5 ter | Acquisition | Library | `POST /internal/media/present` (films toujours disponibles) | `X-Internal-Key` | 3 s, 1 essai | Acquisition s'en tient aux téléchargements terminés qu'il a enregistrés | fait (#293) |
| 6 | Acquisition | Library | `POST /internal/reindex` | `X-Internal-Key` | — | une réindexation manuelle par l'administrateur reste possible | côté Library fait (#72), **non appelé** par Acquisition |
| 7 | Acquisition | Transmission | RPC HTTP (`/transmission/rpc`) | identifiants Transmission (`TRANSMISSION_USER`, `TRANSMISSION_PASS`) | 3 s (`TRANSMISSION_TIMEOUT`) | `503 TORRENT_CLIENT_UNAVAILABLE`, sans détail technique | fait (#74) |
| 8 | Identity | Acquisition | purge des données d'un compte (acquittements, historique) | `X-Internal-Key` | — | — | **pas encore** : Acquisition n'a pas d'API interne |
| 9 | Identity | Library et Acquisition | `GET /actuator/health` (état des services pour l'administration, `GET /api/v1/admin/system/status`) | aucune : point public, sans détail, jamais routé par le proxy | 2 s de connexion et 2 s de lecture par service, sondes en parallèle, 3 s au total | un service qui ne répond pas est `DOWN`, l'ensemble `DEGRADED` ; l'appel ne rend jamais d'erreur | fait (#81) |

Le frontend ne parle qu'au reverse proxy, jamais directement à un service ; les services ne se font jamais confiance sur l'identité de l'utilisateur à partir d'un en-tête : elle vient du jeton (JWT), vérifié localement.

## Sécurité commune

- **Un secret partagé par destinataire** : `INTERNAL_API_KEY`, envoyé dans l'en-tête `X-Internal-Key`, comparé en temps constant. **Refus par défaut** : un service sans secret configuré refuse tout appel interne.
- Un jeton JWT d'utilisateur ne donne **aucun** accès aux routes `/internal/**` (401), et le secret n'est **jamais** accepté sur `/api/v1/**`.
- Le secret n'est écrit dans aucun fichier du dépôt : il est généré dans `.env` (`gen-secrets.sh`) et injecté par `compose.yaml` uniquement aux services concernés (vérifié par l'audit de sécurité des conteneurs).
- Les erreurs sont toujours au format `problem+json` avec un `code` stable (`docs/api/CONVENTIONS.md`), sans adresse, chemin, trace ni secret.
- Les identifiants de Transmission ne sont connus que d'Acquisition et de Transmission ; Transmission est seul sur le réseau `torrent` avec Acquisition.

## Séquences

### Suppression d'un profil (Identity → Library)

```text
Frontend ─ DELETE /profiles/{id} ─▶ Identity
  Identity : vérifie que le profil appartient au compte du jeton (sinon 404) et qu'il n'est pas le dernier (409)
  Identity ─ POST /internal/purge {PROFILE, profileId} + X-Internal-Key ─▶ Library
     Library : supprime favoris et progression du profil (jamais les médias ni les fichiers) → 204
  Identity : supprime le profil → 204
  ── Library injoignable ou en erreur : Identity répond 503 LIBRARY_UNAVAILABLE, le profil est conservé.
```

### Suppression d'un compte (Identity → Library)

```text
Frontend ─ DELETE /accounts/me {password} ─▶ Identity          (ou DELETE /admin/accounts/{id}, ADMIN)
  Identity : mot de passe incorrect → 401 ; dernier administrateur actif → 409 LAST_ADMIN
  Identity ─ POST /internal/purge {ACCOUNT, accountId} + X-Internal-Key ─▶ Library
     Library : supprime favoris et progression de tous les profils du compte → 204
  Identity : supprime le compte ; profils et sessions partent en cascade → 204
  ── Library injoignable : 503 LIBRARY_UNAVAILABLE, rien n'est supprimé ; l'utilisateur ou l'administrateur réessaie.
```

La purge est **idempotente** : rejouer l'appel après un échec partiel ne produit pas d'erreur.

### Validation d'un jeton (Library ou Acquisition → Identity)

```text
Client ─ requête + Authorization: Bearer <JWT> ─▶ Library / Acquisition
  Service : lit l'en-tête `kid`, cherche la clé publique dans son cache
     clé inconnue → GET /.well-known/jwks.json ─▶ Identity (3 s maximum) puis remise en cache
  Service : vérifie signature RS256, émetteur, expiration, `sub` (UUID) → autorise selon `roles` et `pid`
  ── Identity injoignable au moment de charger les clés : 503 IDENTITY_UNAVAILABLE (et non 401, qui ferait croire à une session expirée).
```

### Téléchargement terminé (Acquisition → Library)

```text
Admin ─ POST /downloads ─▶ Acquisition ─ RPC ─▶ Transmission           (téléchargement lancé, état DOWNLOADING)
  … Transmission télécharge dans /downloads/complete …
  Acquisition (synchronisation) : Transmission annonce « terminé »
  Acquisition ─ POST /internal/downloads/completed {relativePath} ─▶ Library
     Library : le fichier existe dans /downloads et c'est une vidéo → l'entrée passe à AVAILABLE → 200 {mediaId}
     fichier absent → 404 MEDIA_FILE_MISSING ; chemin invalide (absolu, `..`) → 400 ; dossier non déclaré → 409
  Acquisition : passe le téléchargement à COMPLETED (le `mediaId` reçu est conservé)
  ── échec après les essais, ou refus : le téléchargement passe FAILED, sans reprise automatique.
```

Dès que le nom du fichier est connu, Acquisition appelle `POST /internal/downloads` : le catalogue l'affiche « en téléchargement ». Après un échec ou une annulation, `POST /internal/downloads/failed` retire cet état.

Avant d'afficher le catalogue ou de démarrer un téléchargement, `POST /internal/media/present` vérifie que les films déjà reçus sont toujours disponibles.

## Gestion des pannes

| Panne | Ce que voit l'appelant | Ce qui est garanti |
|---|---|---|
| Library injoignable pendant une purge | `503 LIBRARY_UNAVAILABLE` | rien n'est supprimé côté Identity ; l'opération se rejoue |
| Identity injoignable pour charger les clés | `503 IDENTITY_UNAVAILABLE` | pas de faux 401 ; les clés déjà en cache restent utilisables |
| Transmission injoignable | `503 TORRENT_CLIENT_UNAVAILABLE` | le téléchargement concerné passe `FAILED` (code `TORRENT_CLIENT_UNAVAILABLE`), l'entrée du catalogue n'est pas bloquée |
| Secret interne absent, faux ou jeton utilisateur sur `/internal` | `401` | aucun traitement, aucune fuite d'information |
| Appel interne rejoué | même résultat que le premier | purge, « téléchargement démarré », « arrêté » et « terminé » sont idempotents |

Écart connu avec l'ADR 0001 (décision 6, « 3 s et 2 tentatives ») : les appels d'Identity vers Library ont aujourd'hui 2 s de délai de connexion, 5 s de lecture et **une seule tentative** ; l'échec est rendu à l'utilisateur, qui peut réessayer. L'appel d'Acquisition vers Library a un délai de 3 s et fait **3 essais** au plus.

---

# Référence : API interne de Library (`/internal/**`)

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

### `POST /internal/downloads/failed` — Acquisition (échec ou annulation)
Même corps (`title` ignoré). Une entrée créée pour ce téléchargement est supprimée ; une entrée qui existait déjà redevient `UNAVAILABLE` ; une entrée dans un autre état ne change pas. Idempotent.

Réponses : `204` ; `400` chemin invalide.

### `POST /internal/media/present` — Acquisition (films toujours disponibles)
```json
{ "mediaIds": ["<uuid>"] }
```
Au plus 100 identifiants. Réponse : `200 {"mediaIds":[…]}`, limitée aux médias non retirés et `AVAILABLE`.

### `POST /internal/reindex` — Acquisition
Lance l'indexation de tous les dossiers autorisés. Si une indexation tourne déjà, son état est renvoyé (pas d'erreur).
Réponse : `202` avec l'état d'indexation.

## Configuration

| Variable | Rôle |
|---|---|
| `INTERNAL_API_KEY` | secret partagé (identique chez l'appelant) |
| `DOWNLOADS_ROOT` | dossier de téléchargements, à déclarer comme dossier autorisé (`/downloads` par défaut) |
