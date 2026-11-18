-- Recherche insensible à la casse et aux accents sans extension PostgreSQL (unaccent exigerait des droits
-- supplémentaires). Fonction IMMUTABLE : utilisable dans un index.
CREATE FUNCTION normalize_search(input TEXT) RETURNS TEXT
    LANGUAGE sql IMMUTABLE STRICT
AS $$
    SELECT replace(replace(lower(translate(input,
        'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüýÿ',
        'AAAAAACEEEEIIIINOOOOOUUUUYaaaaaaceeeeiiiinooooouuuuyy')), 'œ', 'oe'), 'æ', 'ae')
$$;

CREATE INDEX idx_media_metadata_title_search ON media_metadata (normalize_search(title));
