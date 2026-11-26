# Conventions API communes

Valables pour `identity-service`, `library-service` et `acquisition-service`. Les contrats OpenAPI du dossier `docs/api/` s'y réfèrent.

## URL et versionnement

- Chaque service expose ses routes sous `/api/v1/...` (JSON, UTF-8).
- Le reverse proxy nginx (image `frontend`) est le seul point d'entrée public et retire le préfixe du service :

| URL publique (frontend) | Service | Route interne |
|---|---|---|
| `/api/identity/v1/...` | identity-service (8081) | `/api/v1/...` |
| `/api/library/v1/...` | library-service (8082) | `/api/v1/...` |
| `/api/acquisition/v1/...` | acquisition-service (8083) | `/api/v1/...` |

- `/internal/**` et `/actuator/**` ne sont jamais routés par le proxy.
- Une rupture de contrat crée `/api/v2` ; l'ajout de champs optionnels reste en `v1`.

## Authentification

- En-tête `Authorization: Bearer <access token>` (JWT) sur toutes les routes protégées. Les opérations anonymes sont listées explicitement dans chaque contrat.
- Le profil actif est lu dans le claim `pid` du jeton, jamais dans l'URL ni dans le corps.

## Format des erreurs (RFC 9457)

Toute réponse d'erreur utilise `Content-Type: application/problem+json` :

```json
{
  "type": "https://homeflix.local/problems/media-file-missing",
  "title": "Fichier introuvable",
  "status": 404,
  "code": "MEDIA_FILE_MISSING",
  "detail": "Le fichier de ce film n'est plus accessible.",
  "instance": "/api/v1/stream/6f1c…",
  "errors": [{ "field": "title", "message": "Ne peut pas être vide" }]
}
```

- `code` : identifiant stable en `SCREAMING_SNAKE_CASE`, utilisé par le frontend pour choisir le message français affiché. `detail` est informatif et ne doit jamais être affiché tel quel.
- `errors` : présent uniquement pour `VALIDATION_ERROR` (une entrée par champ invalide).
- **Interdit dans une réponse d'erreur** : trace de pile, nom de classe, requête SQL, chemin du système de fichiers, valeur d'un secret, identifiant révélant l'existence d'une ressource d'un autre utilisateur.

### Statuts HTTP

| Statut | Usage |
|---|---|
| 400 | Requête mal formée ou validation (`VALIDATION_ERROR`) |
| 401 | Jeton absent, invalide ou expiré |
| 403 | Authentifié mais rôle insuffisant |
| 404 | Ressource inexistante **ou appartenant à un autre utilisateur** (pas de 403, pour éviter l'énumération) |
| 405 | Méthode HTTP non prise en charge par la route (en-tête `Allow`) |
| 406 | Format de réponse demandé (`Accept`) non disponible |
| 409 | Conflit d'état (doublon, dernier administrateur, scan déjà en cours) |
| 412 | Précondition non remplie (rappel des droits non acquitté) |
| 415 | Type de contenu de la requête (`Content-Type`) non pris en charge |
| 416 | Plage `Range` invalide |
| 423 | Compte verrouillé ou désactivé temporairement (si utilisé) |
| 429 | Trop de tentatives (`Retry-After` obligatoire) |
| 500 | Erreur inattendue, message générique |
| 503 | Dépendance indisponible (base, client BitTorrent, autre service, Identity pour la validation des jetons) |

### Codes d'erreur métier

| Code | Statut | Sens |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Un ou plusieurs champs invalides |
| `AUTH_INVALID_CREDENTIALS` | 401 | Identifiants incorrects (message identique que le compte existe ou non) |
| `SESSION_EXPIRED` | 401 | Jeton ou refresh token expiré : l'interface demande de se reconnecter |
| `TICKET_EXPIRED` | 401 | Ticket de streaming expiré |
| `ACCOUNT_DISABLED` | 403 | Compte désactivé |
| `ACCESS_DENIED` | 403 | Rôle insuffisant |
| `NOT_FOUND` | 404 | Ressource introuvable |
| `SETUP_TOKEN_INVALID` | 403 | Jeton de setup invalide |
| `SETUP_ALREADY_DONE` | 409 | Le premier administrateur existe déjà |
| `LAST_ADMIN` | 409 | Opération refusée sur le dernier administrateur |
| `PROFILE_LIMIT_REACHED` | 409 | Nombre maximal de profils atteint |
| `PROFILE_NOT_SELECTED` | 409 | Route liée au profil appelée sans claim `pid` |
| `CONFLICT` | 409 | Autre conflit d'état |
| `RATE_LIMITED` | 429 | Trop de tentatives |
| `ROOT_NOT_FOUND` | 400 | Dossier autorisé introuvable |
| `ROOT_NOT_READABLE` | 400 | Dossier autorisé non lisible |
| `ROOT_NOT_A_DIRECTORY` | 400 | Le chemin n'est pas un dossier |
| `ROOT_NOT_ALLOWED` | 400 | Chemin invalide (relatif, `..`) ou en dehors des emplacements autorisés (`/media`, `/downloads`) |
| `ROOT_OVERLAP` | 409 | Le dossier contient ou est contenu dans un dossier déjà configuré |
| `INDEX_ALREADY_RUNNING` | 409 | Une indexation est déjà en cours |
| `MEDIA_FILE_MISSING` | 404 | Fichier du média absent ou inaccessible |
| `MEDIA_UNAVAILABLE` | 409 | Média marqué indisponible |
| `MEDIA_UNSUPPORTED_FORMAT` | 415 | Format non supporté pour la lecture (réservé : aucun service ne le renvoie aujourd'hui) |
| `RIGHTS_NOT_ACKNOWLEDGED` | 412 | Rappel des droits non acquitté avant téléchargement |
| `DOWNLOAD_ALREADY_ACTIVE` | 409 | Téléchargement déjà actif pour cette entrée |
| `TORRENT_CLIENT_UNAVAILABLE` | 503 | Client BitTorrent injoignable |
| `LIBRARY_UNAVAILABLE` | 503 | Library injoignable depuis un autre service |
| `IDENTITY_UNAVAILABLE` | 503 | Identity injoignable : le jeton n'a pas pu être vérifié (ce n'est **pas** une session expirée : l'interface ne doit pas déconnecter l'utilisateur) |
| `INTERNAL_ERROR` | 500 | Erreur inattendue (message générique) |

Le champ `detail` des erreurs standard du serveur web (405, 406, 415, 400 non métier) est un **message fixe en français** : il ne reprend jamais ce que le client a envoyé.

### Autres codes d'erreur (sans message dédié)

| Code | Statut | Sens |
|---|---|---|
| `ACQUISITION_UNAVAILABLE` | 503 | Acquisition injoignable depuis un autre service |

### Codes des erreurs HTTP standard

Erreurs de protocole du serveur web, **jamais déclenchées par l'interface** : le frontend n'a pas de message dédié et retombe sur son message générique. Utiles pour les clients tiers et les tests. Le `detail` est un message fixe en français, jamais une valeur envoyée par le client.

| Code | Statut | Sens |
|---|---|---|
| `METHOD_NOT_ALLOWED` | 405 | Méthode HTTP non prise en charge par la route (en-tête `Allow`) |
| `NOT_ACCEPTABLE` | 406 | Format de réponse demandé (`Accept`) non disponible |
| `RANGE_NOT_SATISFIABLE` | 416 | Plage demandée hors des limites du fichier (`Content-Range: bytes */<taille>`) |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | `Content-Type` de la requête non pris en charge (à ne pas confondre avec `MEDIA_UNSUPPORTED_FORMAT`, qui concerne un fichier vidéo) |

### Codes d'échec d'un téléchargement

Valeurs du champ `errorCode` d'un téléchargement `FAILED` (Acquisition). Ce ne sont pas des erreurs HTTP : le frontend s'en sert pour choisir le message français affiché.

| Code | Sens |
|---|---|
| `NO_PEERS` | Aucun pair disponible pour ce fichier |
| `DISK_FULL` | Espace disque insuffisant dans le dossier de téléchargements |
| `TORRENT_CLIENT_UNAVAILABLE` | Client BitTorrent injoignable pendant le téléchargement |
| `TORRENT_LOST` | Le client BitTorrent ne connaît plus le torrent |
| `DOWNLOAD_FAILED` | Échec signalé par le client sans cause précise |
| `INVALID_FILE` | Aucune vidéo `mp4`, `mkv` ou `webm` dans le torrent |
| `LIBRARY_UNAVAILABLE` | Fichier téléchargé, Library injoignable ou en erreur |
| `LIBRARY_REJECTED` | Fichier téléchargé, refusé par Library (fichier absent, dossier non déclaré) |

## Pagination

Paramètres : `page` (défaut 0), `size` (défaut 20, maximum 50), `sort` (`champ,asc|desc`). Réponse :

```json
{ "items": [], "page": 0, "size": 20, "total": 0, "totalPages": 0 }
```

## Données

- Identifiants : UUID v4 en chaîne.
- Dates et heures : ISO-8601 en UTC (`2026-11-16T08:00:00Z`).
- Durées : en secondes (entiers).
- Nommage JSON : `camelCase`.
- Les énumérations sont en `SCREAMING_SNAKE_CASE`.

## Requêtes d'écriture

- Les opérations `PUT` et `DELETE` sont idempotentes ; répéter une requête ne produit pas d'erreur.
- Le refresh et la déconnexion exigent l'en-tête `X-Requested-With: homeflix` (protection CSRF, voir ADR 0001).
- `X-Request-Id` est généré par le proxy, propagé aux services et journalisé.
