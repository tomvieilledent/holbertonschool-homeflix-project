-- Seed du catalogue : le fichier de démonstration du téléchargement P2P (voir docs/legal/P2P_DEMO.md, issue #46).
-- Idempotent : l'identifiant est fixe et ON CONFLICT ignore l'insertion si l'empreinte existe déjà ; rejouer ce
-- script ne crée jamais de doublon. Seules des entrées dont la licence est documentée ont leur place ici.

INSERT INTO catalogue_entries (id, title, source, license, license_proof_url, magnet_uri, infohash, size_bytes)
VALUES (
    '7d1c0a52-3f6e-4b8a-9c21-0f4a6e2b1d11',
    'Sintel',
    'Blender Foundation (projet Durian), publié en torrent par WebTorrent',
    'Creative Commons Attribution 3.0 (CC BY 3.0)',
    'https://durian.blender.org/sharing/',
    -- Sans web seed : les données ne peuvent venir que de pairs BitTorrent (voir docs/legal/P2P_DEMO.md).
    'magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel'
        || '&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=udp%3A%2F%2Fexplodie.org%3A6969'
        || '&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969'
        || '&tr=udp%3A%2F%2Ftracker.empire-js.us%3A1337&xs=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2Fsintel.torrent',
    '08ada5a7a6183aae1e09d831df6748d566095a10',
    129302391   -- taille totale du torrent : Sintel.mp4 (129 241 752 octets), affiche et sous-titres
)
ON CONFLICT (infohash) DO NOTHING;
