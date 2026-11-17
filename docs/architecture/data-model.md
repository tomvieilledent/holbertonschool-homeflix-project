# Modèle de données et propriété des données

Chaque service possède sa base PostgreSQL (rôle SQL dédié, voir `homeflix/initdb/`) et ses migrations Flyway. **Aucun service ne lit ni n'écrit dans la base d'un autre**, et aucune clé étrangère ne traverse une frontière de service : les références entre services (`account_id`, `profile_id`, `media_id`) sont de simples UUID, sans contrainte.

| Service | Base | Propriétaire de |
|---|---|---|
| identity-service | `identity` | comptes, rôles, profils, sessions (refresh tokens), état du setup |
| library-service | `library` | dossiers autorisés, médias, métadonnées, favoris, progression |
| acquisition-service | `acquisition` | catalogue autorisé, téléchargements, acquittements du rappel des droits |

## Identity

```mermaid
erDiagram
    roles ||--o{ accounts : "role"
    accounts ||--o{ profiles : "possède"
    accounts ||--o{ refresh_tokens : "sessions"
    roles { text name PK "USER | ADMIN" }
    accounts {
        uuid id PK
        text username UK
        text email UK
        text password_hash "Argon2id"
        text role FK
        boolean enabled
        boolean must_change_password
        timestamptz created_at
    }
    profiles {
        uuid id PK
        uuid account_id FK "ON DELETE CASCADE"
        text name "unique par compte"
        text avatar
        timestamptz created_at
    }
    refresh_tokens {
        uuid id PK
        uuid account_id FK "ON DELETE CASCADE"
        uuid family_id "détection de rejeu"
        text token_hash UK "SHA-256, jamais le jeton"
        timestamptz expires_at
        timestamptz revoked_at
        timestamptz created_at
    }
    setup_state {
        boolean singleton PK "une seule ligne"
        text token_hash
        timestamptz completed_at
    }
```

Règles : 5 profils maximum par compte (appliqué par le service) ; le dernier administrateur ne peut être ni désactivé, ni rétrogradé, ni supprimé ; le jeton de setup n'est plus valide dès que `completed_at` est renseigné.

## Library

```mermaid
erDiagram
    media_roots ||--o{ media_items : "contient"
    media_items ||--|| media_metadata : "décrit"
    media_items ||--o{ favourites : "favori de"
    media_items ||--o{ progress : "progression de"
    media_roots {
        uuid id PK
        text path UK "chemin canonique dans le conteneur ; unique parmi les dossiers non retirés"
        text label
        boolean enabled
        boolean removed "retiré par l'administrateur (suppression douce) : ses médias passent à UNAVAILABLE"
        timestamptz created_at
    }
    media_items {
        uuid id PK
        uuid root_id FK
        text relative_path "UK avec root_id"
        bigint size_bytes
        timestamptz file_mtime
        text fingerprint "empreinte pour les doublons"
        text availability "AVAILABLE | UNAVAILABLE | DOWNLOADING"
        timestamptz last_seen_at
        boolean deleted "retiré par l'admin, jamais réindexé"
        timestamptz added_at
    }
    media_metadata {
        uuid media_id PK "FK media_items"
        text title
        text description
        text[] genres
        int year
        int duration_seconds
        text poster_path
        boolean edited "protège des écrasements par l'indexation"
    }
    favourites {
        uuid account_id "sans FK (Identity)"
        uuid profile_id "sans FK (Identity)"
        uuid media_id FK
        timestamptz added_at
    }
    progress {
        uuid account_id "sans FK (Identity)"
        uuid profile_id "sans FK (Identity)"
        uuid media_id FK
        int position_seconds
        int duration_seconds
        text state "NOT_STARTED | STARTED | COMPLETED"
        timestamptz updated_at
    }
```

Contraintes : `UNIQUE (root_id, relative_path)` et empreinte de contenu pour éviter les doublons entre scans ; `UNIQUE (profile_id, media_id)` sur `favourites` et `progress`. Les lignes `favourites` et `progress` conservent `account_id` pour permettre la purge d'un compte entier.

## Acquisition

```mermaid
erDiagram
    catalogue_entries ||--o{ downloads : "source de"
    catalogue_entries {
        uuid id PK
        text title
        text source "organisme ou site d'origine"
        text license "licence ou autorisation, NOT NULL"
        text license_proof_url "preuve, NOT NULL"
        text magnet_uri "lu en base, jamais fourni par le client"
        text infohash UK
        bigint size_bytes
    }
    downloads {
        uuid id PK
        uuid entry_id FK
        uuid requested_by "account_id, sans FK (Identity)"
        text state "QUEUED | DOWNLOADING | COMPLETED | FAILED | CANCELLED"
        int progress_percent
        text error_code
        text torrent_id "identifiant côté client BitTorrent"
        text file_relative_path
        timestamptz created_at
        timestamptz finished_at
    }
    rights_acknowledgements {
        uuid account_id PK "sans FK (Identity)"
        text notice_version PK
        timestamptz acknowledged_at
    }
```

Règles : une entrée sans licence ni preuve ne peut pas être insérée (contraintes `NOT NULL`) ; un seul téléchargement actif par entrée ; l'acquittement du rappel des droits est requis avant le premier téléchargement d'un compte.

## Cohérence entre services

| Événement | Service source | Effet dans les autres services | Mécanisme |
|---|---|---|---|
| Suppression d'un profil | Identity | Library supprime ses favoris et sa progression | `POST /internal/purge` (profil) |
| Suppression d'un compte | Identity | Library purge toutes les données du compte ; Acquisition supprime ses acquittements | `POST /internal/purge` (compte) |
| Téléchargement démarré | Acquisition | Library peut afficher l'entrée en `DOWNLOADING` | `POST /internal/...` de Library |
| Téléchargement terminé | Acquisition | Library enregistre le fichier du dossier de téléchargements et lance l'indexation | `POST /internal/...` de Library |

- La purge est **asynchrone et rejouable** : si l'appel échoue, Identity conserve une demande de purge en attente et réessaie. Une donnée orpheline (profil supprimé) est inoffensive car Library n'expose une ligne que via le `pid` d'un jeton valide.
- Library traite un `account_id` ou `profile_id` inconnu comme une donnée sans propriétaire ; elle ne les valide jamais en interrogeant la base d'Identity.
- Supprimer un compte, un profil ou une entrée du catalogue **ne supprime jamais un fichier média**.
