-- Profil actif mémorisé dans la session de refresh : il est restitué dans le jeton rafraîchi (claim pid).
ALTER TABLE refresh_tokens ADD COLUMN active_profile_id UUID;
