-- Schéma d'Acquisition (voir docs/architecture/data-model.md).
-- Acquisition ne référence jamais les tables d'Identity ni de Library : account_id n'est qu'un UUID, sans clé étrangère.
-- Règle du sujet : le catalogue ne contient que des contenus dont la licence est documentée. Un simple NOT NULL ne
-- suffit pas (une chaîne vide ou faite d'espaces passe un NOT NULL) : chaque champ de droits a aussi un CHECK non vide.

CREATE TABLE catalogue_entries (
    id                UUID PRIMARY KEY,
    title             TEXT        NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
    source            TEXT        NOT NULL CHECK (char_length(btrim(source)) > 0),                -- organisme ou site d'origine
    license           TEXT        NOT NULL CHECK (char_length(btrim(license)) > 0),               -- licence ou autorisation de redistribution
    license_proof_url TEXT        NOT NULL CHECK (license_proof_url ~ '^https?://[^ ]+$'),        -- page officielle qui le prouve
    -- Lu en base par le service, jamais fourni par un client (aucune réponse d'API ne le contient).
    magnet_uri        TEXT        NOT NULL CHECK (magnet_uri LIKE 'magnet:?xt=urn:btih:%'),
    infohash          TEXT        NOT NULL UNIQUE CHECK (infohash ~ '^[0-9a-f]{40}$'),            -- SHA-1 en hexadécimal minuscule
    size_bytes        BIGINT      NOT NULL CHECK (size_bytes > 0),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE downloads (
    id                 UUID PRIMARY KEY,
    entry_id           UUID        NOT NULL REFERENCES catalogue_entries (id),
    requested_by       UUID        NOT NULL,                                                       -- account_id, sans clé étrangère (Identity)
    state              TEXT        NOT NULL CHECK (state IN ('QUEUED', 'DOWNLOADING', 'COMPLETED', 'FAILED', 'CANCELLED')),
    progress_percent   INTEGER     NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
    error_code         TEXT,                                                                       -- NO_PEERS, DISK_FULL… (voir CONVENTIONS.md)
    torrent_id         TEXT,                                                                       -- identifiant côté client BitTorrent, jamais exposé
    -- Chemin relatif au dossier de téléchargements : jamais absolu, jamais de segment « .. ».
    file_relative_path TEXT CHECK (
                           file_relative_path IS NULL OR (
                               file_relative_path <> ''
                               AND file_relative_path NOT LIKE '/%'
                               AND file_relative_path !~ '(^|/)\.\.(/|$)'
                           )
                       ),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at        TIMESTAMPTZ
);
-- Un seul téléchargement actif par entrée : garanti par la base, même si deux requêtes arrivent ensemble.
CREATE UNIQUE INDEX uq_downloads_one_active_per_entry ON downloads (entry_id) WHERE state IN ('QUEUED', 'DOWNLOADING');
CREATE INDEX idx_downloads_entry ON downloads (entry_id);
CREATE INDEX idx_downloads_requested_by ON downloads (requested_by);   -- purge d'un compte

CREATE TABLE rights_acknowledgements (
    account_id      UUID        NOT NULL,                                                          -- sans clé étrangère (Identity)
    notice_version  TEXT        NOT NULL CHECK (char_length(btrim(notice_version)) > 0),
    acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (account_id, notice_version)                                                       -- un acquittement par compte et par version
);
