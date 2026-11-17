-- Schéma de Library (voir docs/architecture/data-model.md).
-- Library ne référence jamais les tables d'Identity : account_id et profile_id sont de simples UUID, sans clé étrangère.

CREATE TABLE media_roots (
    id         UUID PRIMARY KEY,
    path       TEXT        NOT NULL UNIQUE CHECK (path LIKE '/%'),   -- chemin canonique dans le conteneur
    label      TEXT        NOT NULL CHECK (char_length(label) BETWEEN 1 AND 80),
    enabled    BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE media_items (
    id            UUID PRIMARY KEY,
    root_id       UUID        NOT NULL REFERENCES media_roots (id),
    -- Chemin relatif à la racine ; jamais absolu, jamais de segment « .. » (défense en profondeur contre le path traversal).
    relative_path TEXT        NOT NULL CHECK (
                      relative_path <> ''
                      AND relative_path NOT LIKE '/%'
                      AND relative_path !~ '(^|/)\.\.(/|$)'
                  ),
    size_bytes    BIGINT      NOT NULL CHECK (size_bytes >= 0),
    file_mtime    TIMESTAMPTZ NOT NULL,
    fingerprint   TEXT        NOT NULL,                              -- empreinte de contenu, pour reconnaître un fichier déplacé
    availability  TEXT        NOT NULL DEFAULT 'AVAILABLE'
                      CHECK (availability IN ('AVAILABLE', 'UNAVAILABLE', 'DOWNLOADING')),
    last_seen_at  TIMESTAMPTZ NOT NULL,
    deleted       BOOLEAN     NOT NULL DEFAULT FALSE,                -- retiré par l'administrateur, jamais réindexé
    added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_media_items_root_path UNIQUE (root_id, relative_path)
);
CREATE INDEX idx_media_items_fingerprint ON media_items (fingerprint);
CREATE INDEX idx_media_items_added_at ON media_items (added_at DESC);
CREATE INDEX idx_media_items_availability ON media_items (availability);

CREATE TABLE media_metadata (
    media_id         UUID PRIMARY KEY REFERENCES media_items (id) ON DELETE CASCADE,
    title            TEXT    NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
    description      TEXT,
    genres           TEXT[]  NOT NULL DEFAULT '{}',
    year             INTEGER CHECK (year BETWEEN 1880 AND 2100),
    duration_seconds INTEGER CHECK (duration_seconds >= 0),
    poster_path      TEXT,
    edited           BOOLEAN NOT NULL DEFAULT FALSE                  -- protège les corrections de l'administrateur contre l'indexation
);

CREATE TABLE favourites (
    account_id UUID        NOT NULL,                                 -- sans clé étrangère (Identity)
    profile_id UUID        NOT NULL,                                 -- sans clé étrangère (Identity)
    media_id   UUID        NOT NULL REFERENCES media_items (id) ON DELETE CASCADE,
    added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (profile_id, media_id)
);
CREATE INDEX idx_favourites_account ON favourites (account_id);      -- purge d'un compte

CREATE TABLE progress (
    account_id       UUID        NOT NULL,                           -- sans clé étrangère (Identity)
    profile_id       UUID        NOT NULL,                           -- sans clé étrangère (Identity)
    media_id         UUID        NOT NULL REFERENCES media_items (id) ON DELETE CASCADE,
    position_seconds INTEGER     NOT NULL DEFAULT 0 CHECK (position_seconds >= 0),
    duration_seconds INTEGER     NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
    state            TEXT        NOT NULL DEFAULT 'NOT_STARTED'
                         CHECK (state IN ('NOT_STARTED', 'STARTED', 'COMPLETED')),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (profile_id, media_id)
);
CREATE INDEX idx_progress_account ON progress (account_id);          -- purge d'un compte
CREATE INDEX idx_progress_profile_recent ON progress (profile_id, updated_at DESC);  -- « continuer à regarder »
