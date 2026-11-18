-- Précise le sens de media_items.fingerprint. Le commentaire de V1 parlait d'« empreinte de contenu pour
-- reconnaître un fichier déplacé » ; or l'indexation (#38) calcule le SHA-256 de « taille|mtime|chemin relatif ».
-- Elle détecte qu'un fichier a changé, pas qu'il a été déplacé (détection des déplacements : #73).
-- V1 n'est pas modifiée : Flyway enregistre sa somme de contrôle, la changer ferait échouer les bases déjà migrées.
COMMENT ON COLUMN media_items.fingerprint IS 'SHA-256 de taille|mtime|chemin relatif : détecte la modification d''un fichier, pas son déplacement';
