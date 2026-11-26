-- Média créé par Library pour un téléchargement terminé (sans clé étrangère : la donnée appartient à Library).
ALTER TABLE downloads ADD COLUMN library_media_id UUID;
