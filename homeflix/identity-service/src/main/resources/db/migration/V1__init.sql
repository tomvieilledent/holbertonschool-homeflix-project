-- Schéma d'Identity (voir docs/architecture/data-model.md). Aucun mot de passe ni jeton en clair :
-- seuls des hachages sont stockés (Argon2id pour les mots de passe, SHA-256 pour les jetons).

CREATE TABLE roles (
    name TEXT PRIMARY KEY CHECK (name IN ('USER', 'ADMIN'))
);
INSERT INTO roles (name) VALUES ('USER'), ('ADMIN');

CREATE TABLE accounts (
    id                   UUID PRIMARY KEY,
    username             TEXT        NOT NULL UNIQUE CHECK (char_length(username) BETWEEN 3 AND 40),
    email                TEXT        NOT NULL UNIQUE,
    password_hash        TEXT        NOT NULL,
    role                 TEXT        NOT NULL REFERENCES roles (name),
    enabled              BOOLEAN     NOT NULL DEFAULT TRUE,
    must_change_password BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
    id         UUID PRIMARY KEY,
    account_id UUID        NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    name       TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 30),
    avatar     TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (account_id, name)
);
-- La limite de 5 profils par compte est appliquée par le service, pas par la base.

CREATE TABLE refresh_tokens (
    id         UUID PRIMARY KEY,
    account_id UUID        NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    family_id  UUID        NOT NULL,
    token_hash TEXT        NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_tokens_account ON refresh_tokens (account_id);
CREATE INDEX idx_refresh_tokens_family ON refresh_tokens (family_id);

-- Une seule ligne : l'état de la configuration initiale (premier administrateur).
CREATE TABLE setup_state (
    singleton    BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    token_hash   TEXT,
    completed_at TIMESTAMPTZ
);
