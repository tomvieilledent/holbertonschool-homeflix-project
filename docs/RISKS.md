# Registre des risques — HomeFlix

Ce registre recense les risques du projet (techniques, sécurité, droits, organisation) avec leur probabilité, leur impact, la mesure prévue et le responsable. Il est **révisé à J5 (20/11) et à J9 (26/11)** et mis à jour dès qu'un risque se réalise ou change de niveau.

## Échelle

| Niveau | Probabilité | Impact |
|---|---|---|
| 1 — Faible | Peu probable d'ici la fin du projet | Gêne mineure, contournable |
| 2 — Moyen | Possible | Fonction dégradée, ou retard d'une demi-journée à une journée |
| 3 — Élevé | Probable | Parcours principal ou démo compromis, faille de sécurité, ou point éliminatoire du sujet |

**Criticité = probabilité × impact** (1 à 9). 6 ou plus : suivi à chaque daily ; 3 à 4 : suivi aux points d'intégration ; 2 ou moins : surveillance.

## Registre

| # | Catégorie | Risque | P | I | Crit. | Mesure (prévention et plan B) | Responsable | Issues |
|---|---|---|---|---|---|---|---|---|
| R1 | Accès fichiers | **Path traversal** : un utilisateur lit un fichier hors des dossiers autorisés (`../`, lien symbolique) | 2 | 3 | 6 | Le client n'envoie jamais de chemin, seulement un identifiant de média. Le serveur résout le chemin canonique et vérifie qu'il reste sous une racine configurée. Tests de chemins interdits et de liens symboliques | Haitu | #30, #90 |
| R2 | Accès fichiers | Le service Library ou un conteneur **modifie ou efface la bibliothèque source** | 1 | 3 | 3 | Montage `/media` en lecture seule ; suppression d'une entrée du catalogue sans toucher au fichier ; test de suppression de compte | Haitu | #42, #71, #97 |
| R3 | Accès fichiers | **Droits UID/GID** : un conteneur ne peut pas lire `/media` ou écrire dans `/downloads` | 3 | 2 | 6 | Aligner `PUID`/`PGID` de Transmission et l'utilisateur d'Acquisition ; tester tôt sur un environnement propre ; documenter les prérequis de montage | Haitu | #42, #61, #90 |
| R4 | Accès fichiers | **Partage réseau (NAS, SMB/NFS)** : comportement des droits et du lecture seule variable, fichiers temporairement inaccessibles | 2 | 2 | 4 | Ne supporter officiellement que Docker sur Linux et Docker Desktop (WSL2) ; documenter le montage sur l'hôte ; marquer les fichiers inaccessibles `UNAVAILABLE` au lieu de planter | Haitu | #73, #116 |
| R5 | Identité | **Accès aux données d'un autre profil** (IDOR) : progression ou favoris lus ou modifiés en changeant un identifiant | 2 | 3 | 6 | Le profil actif vient uniquement du jeton signé (`pid`), jamais de l'URL ; réponse 404 pour une ressource d'un autre compte ; tests d'isolation entre deux profils | Tom | #59, #63, #64, #78, #98 |
| R6 | Identité | **Vol ou rejeu d'un jeton** (access token, refresh token, ticket de streaming) | 2 | 3 | 6 | Access token de 15 minutes en mémoire, refresh opaque rotatif en cookie `HttpOnly`, révocation de la famille en cas de réutilisation, ticket de streaming court et lié au média | Tom | #36, #45, #48, #51 |
| R7 | Identité | **Compte administrateur par défaut ou premier admin créé par un tiers** | 1 | 3 | 3 | Jeton de setup à usage unique, aucun compte par défaut ; le point d'accès de setup se verrouille dès qu'un admin existe | Tom | #37, #33 |
| R8 | Identité | **Secret committé** (clé de signature, mot de passe, jeton) | 2 | 3 | 6 | `.env` ignoré, `.env.example` avec `CHANGE_ME`, `scripts/gen-secrets.sh` ; scan de secrets dans la CI ; un secret committé est considéré compromis et changé | Haitu | #28, #29 |
| R9 | Droits d'auteur | **Contenu non autorisé** téléchargé ou partagé pendant la démo | 1 | 3 | 3 | Catalogue d'acquisition fermé (aucune URL libre), chaque entrée avec source et licence, preuves de licence conservées, rappel de droits avant le premier téléchargement, note de sensibilisation | Haitu | #14, #46, #60, #100 |
| R10 | Droits d'auteur | Le client BitTorrent **repartage** des morceaux d'une œuvre dont la redistribution n'est pas permise | 1 | 3 | 3 | Fichier de démo choisi pour sa licence de redistribution ; arrêt du partage une fois le fichier terminé | Haitu | #46, #61 |
| R11 | Téléchargements P2P | **Aucun pair disponible** pour le fichier de démo : le téléchargement ne démarre jamais en soutenance | 2 | 3 | 6 | Valider tôt (J4) un fichier libre avec des pairs actifs ; plan B : seed local sur une seconde machine sous notre contrôle ; test réel la veille et le matin | Haitu | #14, #46, #111, #125 |
| R12 | Téléchargements P2P | **Réseau bloquant BitTorrent** (pare-feu de l'école, NAT, trackers filtrés) | 2 | 3 | 6 | Tester le téléchargement sur le réseau de la soutenance ; solution de repli : partage de connexion mobile ou seed local en réseau interne ; capture d'un transfert réel déjà réussi | Haitu | #61, #111 |
| R13 | Téléchargements P2P | **SSRF** : une URL fournie par l'utilisateur donne accès à un service interne (base, Transmission) | 1 | 3 | 3 | Acquisition n'accepte que des identifiants d'entrées du catalogue autorisé ; liste blanche de sources ; aucune requête vers une adresse privée ou locale | Tom | #79, #107 |
| R14 | Téléchargements P2P | **Interface de Transmission accessible** aux utilisateurs ordinaires | 1 | 3 | 3 | Aucun port publié, aucune route nginx, identifiant et mot de passe de RPC, test depuis l'hôte | Haitu | #61, #90 |
| R15 | Pannes | **Un service est indisponible** (Identity, Library, Acquisition, Transmission) et fait tomber les autres ou affiche une erreur technique | 2 | 2 | 4 | Validation des jetons par JWKS en cache, timeouts de 3 s et 2 tentatives, erreurs `problem+json` avec messages compréhensibles, états d'erreur côté interface | Tom | #41, #106, #22, #66 |
| R16 | Pannes | **Fichier vidéo supprimé ou inaccessible** pendant la lecture ou après le scan | 2 | 2 | 4 | Statut `UNAVAILABLE`, message clair dans le lecteur, scan qui détecte les fichiers manquants | Haitu | #73, #66 |
| R17 | Sauvegardes | **Perte des données** : `docker compose down -v` ou volume supprimé efface comptes, catalogue et progression | 2 | 3 | 6 | Avertissement dans le README, scripts de sauvegarde et de restauration testés, guide dédié | Haitu | #75, #100, #89 |
| R18 | Sauvegardes | **Restauration jamais testée** : la sauvegarde existe mais ne se restaure pas | 2 | 2 | 4 | Tester la restauration sur un environnement vierge pendant la recette | Haitu | #75, #112 |
| R19 | Retards | **Charge supérieure à la capacité** (≈ 197 h pour 192 h en développement, pics supérieurs à 8 h par jour) | 3 | 3 | 9 | Réduction de périmètre à J5 : issues P2 et P3 d'abord, jamais les tests, la sécurité ni la doc de livraison ; suivi quotidien de l'avancement | Toute l'équipe | #55 |
| R20 | Retards | **Dépendances entre issues** : le travail d'une personne bloque les autres (contrats d'API, JWT, catalogue) | 2 | 2 | 4 | Contrats OpenAPI et fixtures livrés tôt, mocks côté frontend, points d'intégration à J2, J4, J5, J7 | Tom | #23, #25, #19, #52 |
| R21 | Retards | **Installation sur machine vierge échoue** tardivement (variables, volumes, versions) alors que tout marche en local | 2 | 3 | 6 | Tester l'installation propre dès J4 puis à J8, README suivi à la lettre par une personne extérieure à la rédaction | Haitu | #91, #112 |
| R22 | Technique | **Versions très récentes** (Spring Boot 4, Vite, React 19) : documentation incomplète, bibliothèques incompatibles | 2 | 2 | 4 | Se référer aux documentations officielles ; épingler les versions ; isoler les contournements dans une ADR ou dans les limites connues | Tom | #16 |
| R23 | Technique | **Image Transmission non épinglée** (`latest`) : comportement qui change entre deux installations | 2 | 2 | 4 | Épingler une version testée ; la mentionner dans la documentation | Haitu | #61 |
| R24 | Sécurité | **XSS** par un titre ou une description de média | 2 | 2 | 4 | Rendu en texte par défaut du framework, aucun HTML brut ; revue dédiée avec un titre piégé | Jason | #86 |
| R25 | Sécurité | **Contournement de l'interface** : une API protégée est appelée directement sans rôle suffisant | 2 | 3 | 6 | Autorisation vérifiée côté serveur pour chaque opération ; tests d'accès anonyme et de rôle insuffisant | Tom | #35, #78, #107 |
| R26 | Démo | **Imprévu pendant la soutenance** (réseau, machine, base vide) | 2 | 3 | 6 | Répétition chronométrée avec plan B, environnement de démonstration réinitialisable, comptes de démo, vidéo de secours, captures du parcours | Haitu | #93, #125 |
| R27 | Agent IA | **L'agent IA dépasse son rôle** (accès aux secrets, modification de l'authentification, fusion non relue) | 1 | 3 | 3 | Rôle borné par écrit (objectif, entrées, outils, limites) ; l'agent ne fusionne jamais ; chaque constat est vérifié par un humain avant toute modification | Tom | #17, #113 |
| R28 | Organisation | **Connaissance concentrée** : un membre ne peut pas expliquer une partie du projet à l'oral | 2 | 2 | 4 | Revue croisée des PR, entraide en équipe, chaque membre présente sa partie ; fiches de révision | Toute l'équipe | #126, #127, #128 |

## Les risques à surveiller en priorité

| Rang | Risque | Criticité |
|---|---|---|
| 1 | R19 — Charge supérieure à la capacité | 9 |
| 2 | R1, R3, R5, R6, R8, R11, R12, R17, R21, R25, R26 | 6 |

## Révisions

À chaque révision, on réévalue la probabilité et l'impact de chaque ligne, on note ce qui s'est réalisé et on ajoute les nouveaux risques.

| Date | Révision | Changements |
|---|---|---|
| 2026-11-16 | Création (J1) | Registre initial de 28 risques |
| 2026-11-20 | J5 : revue de mi-parcours | _à compléter_ |
| 2026-11-26 | J9 : avant le gel du périmètre | _à compléter_ |
