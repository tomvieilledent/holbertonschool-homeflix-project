-- Retirer un dossier autorisé ne supprime jamais ses médias : le catalogue, les favoris et la
-- progression restent, les médias passent à UNAVAILABLE. Le dossier est donc marqué « removed »
-- (suppression douce) au lieu d'être effacé, ce que la clé étrangère de media_items interdirait.
ALTER TABLE media_roots ADD COLUMN removed BOOLEAN NOT NULL DEFAULT FALSE;

-- L'unicité du chemin ne vaut que pour les dossiers actifs : on peut rajouter un dossier retiré.
ALTER TABLE media_roots DROP CONSTRAINT media_roots_path_key;
CREATE UNIQUE INDEX uq_media_roots_active_path ON media_roots (path) WHERE NOT removed;
