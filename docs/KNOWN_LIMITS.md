# Limites connues, environnements testés et dépannage — HomeFlix

Ce document dit **honnêtement** ce que HomeFlix fait, ce qu'il ne fait pas encore, et dans quelles conditions il a été testé. Il complète le [README](../README.md) (installation, dépannage courant) et le [registre des risques](RISKS.md).

**État au 26/11/2026 (soir)**. Les principales nouveautés visibles du jour (durées, téléchargement dans le catalogue, « Dans la bibliothèque », mot de passe temporaire, compte désactivé, purge d'un compte) ont été rejouées sur la pile réelle remise à zéro (commit `12d033e`, voir [`ACCEPTANCE_REPORT.md`](ACCEPTANCE_REPORT.md)). Le reste, dont l'échec sans pair (#306), les titres terminés (#310) et les fusions postérieures (#317, #318), n'y a pas été rejoué. #321, #322 et #312, fusionnées ensuite, ont été essayées sur la pile reconstruite (commit `ec117da`). Chaque limite renvoie à une **issue** ou à un **choix** assumé du MVP.

## 1. Livré et vérifié

Vérifié sur la pile Docker Compose complète, par le reverse proxy, comme un navigateur (voir [`INTEGRATION_J7.md`](INTEGRATION_J7.md) et [`INSTALLATION_TEST.md`](INSTALLATION_TEST.md)) :

| Fonction | Preuve |
|---|---|
| Installation depuis le README, jusqu'à la première lecture | Test à froid le 23/11 : 6 services `healthy` en 4 min 40 s (#112) |
| Création du premier administrateur, comptes, rôles (ADMIN, USER) | Droits refusés vérifiés : 401 sans jeton, 403 avec un rôle insuffisant, dernier administrateur protégé |
| Profils par compte, listes « Ma liste » et progression séparées par profil | Recette du 24/11 : Alice et Bob ne voient pas les données l'un de l'autre |
| Indexation du dossier de films, sans doublon | Un second scan n'ajoute rien |
| Catalogue, recherche par titre, fiche d'un film | Chrome et Firefox |
| Lecture en streaming avec avance et retour (HTTP Range, réponses 206) | Chrome et Firefox |
| Pause puis reprise à la position enregistrée | Recette du 24/11 |
| Film ou service indisponible : message clair, retour à la normale ensuite | Recette du 24/11 |
| Redémarrage des conteneurs sans perte de données | `scripts/test-persistence.sh`, lancé par la CI |
| Sauvegarde et restauration | `scripts/test-backup-restore.sh`, guide [`BACKUP_RESTORE.md`](BACKUP_RESTORE.md) |
| Acquisition P2P **par l'API** : rappel des droits, démarrage, suivi, annulation, panne du client | 43 contrôles du 23/11 ; Transmission jamais joignable de l'extérieur |
| Écrans d'administration (comptes, dossiers, indexation, métadonnées, catalogue d'acquisition avec rappel des droits, annulation, état des services) et « Mon compte » | Recette visuelle du 25/11 sous Chrome sur la pile réelle : 39 points conformes, 1 écart de texte (corrigé depuis par #317), 4 points non livrés ou non testables (voir L13, L14) |
| Acquisition P2P **de bout en bout depuis l'interface** : rappel des droits, progression, état « Terminé », film indexé, visible et lu | Essai du 25/11 à 22:51 (commit `4652b9f`) : Sintel, 129 241 752 octets, en moins d'une minute, sur le réseau de développement (#111) |
| Annulation en cours de route et échec du client BitTorrent | Essais du 26/11 : annulé à 60 %, aucune donnée ne reste et le film n'apparaît pas ; client arrêté à 13 %, état « Échoué » avec un message lisible (#111) |
| Suppression de son compte : compte, profils, favoris et progression effacés ; côté Acquisition, acquittement effacé et téléchargement conservé sans l'identifiant du compte | Vérifié le 26/11 dans les trois bases (#97, #309) : 1 ligne de chaque avant, 0 après, 1 téléchargement anonymisé |
| Affiche lue à côté de la vidéo | Essai du 26/11 : accueil, catalogue et fiche (#312) |
| Un film téléchargé puis retiré revient en le téléchargeant de nouveau ; un dossier retiré puis rajouté ne crée pas de doublon et garde « Ma liste » et la progression | Essais du 26/11 (#321, #322) |
| Durée affichée pour les fichiers MP4 | Recette du 26/11 : accueil, écran « Médias », fiches (#305) |
| « En téléchargement » dans le catalogue, puis « Dans la bibliothèque » à la place de « Télécharger » | Recette du 26/11 ; une annulation ne laisse aucune fiche (#307, #308) |
| Mot de passe réinitialisé : changement imposé à la connexion suivante | Recette du 26/11 : écran imposé même en tapant une autre adresse, ancien mot de passe refusé ensuite (#274, #315) |
| Compte désactivé : retour à la connexion avec un message | Recette du 26/11, au changement de profil (#314) |

## 2. Non livré ou incomplet

| # | Limite | Effet pour l'utilisateur | Issue ou décision |
|---|---|---|---|
| L1 | **Un téléchargement sans aucun pair** passe en « Échoué » (`NO_PEERS`) après 15 minutes (#306) : comportement couvert par les tests, pas essayé sur un vrai torrent sans source. | Pendant ces 15 minutes il reste « En cours ». Les codes d'échec ont un message dédié (#314). | [#111](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/111) |
| L2 | **Le transfert P2P réel n'a été essayé que sur le réseau de développement.** | Un réseau qui bloque BitTorrent ou un contenu sans pair ferait échouer la démonstration : garder le plan B (captures, vidéo) et revérifier sur le réseau de la soutenance. | #111 ; risques R11 et R12 de [`RISKS.md`](RISKS.md) |
| L3 | **Revue de l'agent IA : presque tous les constats sont traités** (14 constats : 12 acceptés, 1 à clarifier, 1 rejeté). AI-01, AI-02, AI-03, AI-05 à AI-11 et AI-13 sont corrigés ; AI-04 aussi (changement obligatoire du mot de passe, #274) ; reste AI-12, un choix assumé (voir L19). | Aucun constat de gravité Haute n'est ouvert. | [`ai-review/REPORT.md`](ai-review/REPORT.md) |
| L4 | **L'installation n'a pas été essayée par une personne extérieure** au projet. | Le test à froid a été fait par un membre de l'équipe. | [#112](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/112) |
| L5 | **Les écrans d'administration** ont été recettés visuellement le 25/11 sous Chrome (section 1), **avant la refonte de leurs tableaux par #266** : cette nouvelle présentation n'a pas été rerecettée sur la pile réelle. Safari et un navigateur mobile réel n'ont pas été essayés. | Un défaut d'affichage des tableaux reste possible. | Recette des 4 tableaux à refaire ; #96 |
| L6 | **Les métadonnées** (titre, genre, année) **ne sont pas récupérées automatiquement** : elles se corrigent à la main dans l'écran d'administration (PR #251). Un film arrivé par téléchargement n'a que le titre du catalogue : ni année ni genre. | Corriger les métadonnées avant une démonstration, y compris après un téléchargement. | #84 (fermée) |
| L7 | **Pas de sous-titres** dans le lecteur. **Aucune affiche récupérée sur Internet** : seule une image de même nom à côté de la vidéo est affichée (`film.mp4` et `film.jpg` ou `.png`, #312). La durée n'est connue que pour les fichiers MP4 (#305). | Sans image, la carte affiche un pictogramme (c'est le cas d'un film téléchargé dont le torrent ne fournit pas une image de ce nom) ; les `.mkv` et `.webm` n'ont pas de durée. | Choix du MVP |
| L8 | **Profil actif après un renouvellement du jeton** : corrigé côté Identity (#272, test d'intégration). Recette du 26/11 : F5 conserve le profil avec un compte à deux profils, mais le contournement du frontend (#243) est toujours en place, donc cela ne prouve pas à lui seul le correctif serveur. | L'attente de 15 minutes n'a pas été essayée. | [#222](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/222) (fermée) |
| L10 | **Le profil actif n'apparaît pas dans l'en-tête** (la maquette le montre). « Qui regarde ? » propose « Se déconnecter » depuis #318. | On ne voit pas quel profil est actif pendant la navigation. | [#242](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/242) |
| L12 | **Premier lancement guidé** livré (#278). Les états « indexation en cours » et « échouée » ne sont vérifiés que par les tests, et l'accueil ne se met pas à jour seul pendant une indexation. | Recharger la page pour voir les films. | #105 |
| L13 | **Un film retiré du catalogue ne peut pas être rajouté depuis l'écran « Médias »** : l'entrée n'est pas recréée par les indexations suivantes, même si on retire puis rajoute son dossier (c'est annoncé dans les confirmations). Seul un film **téléchargé** revient, en le téléchargeant de nouveau (#321). | Pour retrouver un film d'un dossier : remise à zéro (`reset-demo.sh`) ou API. Ne jamais retirer un film de démonstration par erreur. | Choix de conception de l'écran « Médias » (#84) |
| L14 | **La confirmation d'annulation d'un téléchargement ne dit pas ce qui reste sur le disque.** Essai du 26/11 : une annulation en cours de route ne laisse rien. | Sans effet constaté en cours de route. | Texte de la confirmation à préciser |
| L15 | **Torrent après un échec dû à l'arrêt du client** : corrigé par #282 et **vérifié sur la pile réelle le 26/11** (échec à 53 %, torrent et données partielles retirés au retour du client, relance réussie). Le cas d'une relance dans les secondes qui suivent le retour du client est corrigé par #323 (couvert par les tests, pas essayé sur la pile). | Cliquer de nouveau sur « Télécharger » pour repartir de zéro. | [#280](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/280) (fermée) |
| L16 | **Les doublons de contenu ne sont pas détectés** : deux fichiers identiques à deux chemins différents donnent deux entrées dans le catalogue (l'empreinte est la taille, la date et le chemin). Seul le même fichier atteint deux fois, par un lien symbolique, est compté comme doublon. | Le catalogue peut afficher deux fois le même film. | Choix du MVP, hors du parcours de démonstration ; [#73](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/73) |
| L17 | **Seuls les films arrivés par un téléchargement HomeFlix sont reconnus** comme « Dans la bibliothèque » (#308) ; un film seulement indexé depuis un dossier reste proposé au téléchargement. | Un film déjà présent dans `/media` peut être téléchargé une seconde fois. | Revue IA AI-02 |
| L19 | **Désactiver un dossier (par l'API) ne masque pas ses films** : choix assumé, il est seulement exclu des indexations. Pour les masquer, retirer le dossier. | Aucun écran ne propose la désactivation. | Revue IA AI-12 ; précision au contrat [#313](https://github.com/tomvieilledent/holbertonschool-homeflix-project/pull/313) |
| L22 | **Un fichier `.mp4` corrompu est ajouté au catalogue sans erreur** : l'indexation ne contrôle pas le contenu (constat A3 de la recette des écrans d'administration, non rejoué depuis). | L'échec n'apparaît qu'à la lecture. | [`INTEGRATION_ADMIN.md`](INTEGRATION_ADMIN.md), A3 |

## 3. Limites techniques et de sécurité assumées

| # | Limite | Pourquoi, et ce qu'on a fait | Référence |
|---|---|---|---|
| T1 | **Une désactivation de compte prend effet au plus tard 15 minutes plus tard** pour une session déjà ouverte : le rôle est celui de l'émission du jeton. Le compte ne peut plus se reconnecter tout de suite. La sélection de profil ne permet plus de prolonger cet accès (#286, vérifié le 26/11). | Jeton d'accès de 15 minutes, non révocable avant son expiration. Constaté le 25/11 : une session ouverte répond encore après la désactivation, puis F5 la ferme. La confirmation « Désactiver » l'annonce depuis #317. | [`ARCHITECTURE.md`](ARCHITECTURE.md) §9 ; R6 |
| T2 | **Pas de rotation de la clé de signature** des jetons : le JWKS ne publie qu'une clé. Changer la clé déconnecte tout le monde. | Simplicité du MVP. | ARCHITECTURE §9 |
| T3 | **Les secrets sont dans `.env`** (ignoré par Git, droits 600), pas dans des secrets Docker. | Suffisant pour le MVP, mieux isolé avec `secrets:`. | ARCHITECTURE §9 ; R8 |
| T4 | **HTTP simple sur le port 8080**, pas de HTTPS fourni. Hors `localhost`, le cookie de session `Secure` est refusé par le navigateur. | Mettre HomeFlix derrière un proxy HTTPS, ou `COOKIE_SECURE=false` sur un réseau de confiance (README §8). **HTTPS derrière un proxy externe : non testé.** | ADR 0002 §11 |
| T4b | **Le verrouillage après 5 mauvais mots de passe** (5 minutes) est **en mémoire** : un redémarrage d'Identity le remet à zéro. | Pas de stockage partagé pour le MVP. | README §8 |
| T5 | **Le port de pairs BitTorrent n'est pas publié** : les téléchargements fonctionnent en trafic sortant, parfois plus lentement. | Transmission reste isolé : c'est le prix de l'isolation. | ARCHITECTURE §9 ; R14 |
| T6 | **Le catalogue d'acquisition est fermé** : seules les entrées avec source et licence documentées peuvent être téléchargées. Aucune adresse libre n'est acceptée. | Droit d'auteur : le P2P n'accorde aucun droit. | [`COPYRIGHT_AND_P2P.md`](COPYRIGHT_AND_P2P.md) ; R9, R13 |
| T7 | **La lecture dépend du navigateur** : le fichier est servi tel quel (pas de transcodage). | Voir section 5. | Choix du MVP |
| T8 | **Un service Java s'est arrêté au démarrage** 2 fois sur 7 sur la machine de développement (code 139, plantage de la JVM). La politique de redémarrage le relance. | Cause non établie. `reset-demo.sh` réessaie jusqu'à 5 fois. À surveiller avant la soutenance. | [`DEMO.md`](DEMO.md) |

## 4. Ressources minimales testées

| Ressource | Mesure | Remarque |
|---|---|---|
| Mémoire au repos | **1 431 Mio** pour les six conteneurs | Recommandation : 4 Go disponibles pour Docker. Le pic de la compilation n'a **pas** été mesuré. |
| Disque | Environ **1,3 Go** d'images HomeFlix, plus PostgreSQL et Transmission : **2 Go** annoncés | Plus la place de vos films. |
| Premier démarrage à froid | **186 s** de construction sans cache, puis 96 s pour que les services soient prêts (4 min 40 s au total) | Les images de base étaient déjà présentes. |
| Remise à zéro de la démonstration | De **60 s à 172 s** (6 essais) | Lancer au moins 5 minutes avant une présentation. |
| Ports | **8080 seulement** | Modifiable par `FRONTEND_PORT`. |

## 5. Formats et lecture

- **Extensions indexées** : `.mp4`, `.mkv`, `.webm` (les autres fichiers sont ignorés).
- **Lecture vérifiée** : MP4 en **H.264 et AAC**, dans Chrome et Firefox.
- **`.mkv`** : indexé, mais souvent illisible dans un navigateur (le conteneur n'est pas pris en charge partout). Convertir en MP4 H.264/AAC.
- **Pas de transcodage, pas de sous-titres** (L7, T7).
- **Avance et retour** : par requêtes HTTP Range, vérifiées (réponses 206).

## 6. Environnements testés

| Environnement | État |
|---|---|
| Linux (Ubuntu, GitHub Actions) | Pile complète et tests à chaque pull request et à chaque modification de `main`. Interrompus du 23 au 24/11 par l'épuisement du quota de minutes (dépôt alors privé), rétablis le 24/11 |
| Linux sous WSL 2, Docker 29.9, Compose 5.7, 15 Go de mémoire | Poste de développement : installation à froid, parcours complet, sauvegarde et restauration |
| Chrome et Firefox | Recette du frontend du 24/11 (Firefox : connexion, catalogue, lecture, pause et reprise, plein écran, aucune erreur en console). Écrans d'administration recettés le 25/11 sous Chrome (Firefox : contrôle d'accès, session d'un compte désactivé, suppression de compte). Recette du 26/11 sur les deux navigateurs |
| Safari, navigateur mobile réel | **Non testés.** La mise en page à 390 px a été vérifiée seulement avec les outils de développement de Chrome. |
| macOS, Windows sans WSL 2, ARM (Raspberry Pi) | **Non testés** |
| NAS réel (SMB, NFS) | **Non testé** ; droits et lecture seule variables (R4) |

## 7. Dépannage

Le tableau complet est dans le [README, section 8](../README.md#8-dépannage). Il commence par `docker compose ps` puis `docker compose logs <service>`. Trois cas ne s'y trouvaient pas :

| Symptôme | Cause probable | Solution |
|---|---|---|
| L'écran « Qui regarde ? » réapparaît | La session n'a pas de profil mémorisé (session ouverte avant la mise à jour, ou profil supprimé) | Rechoisir son profil |
| Un compte désactivé peut encore agir un moment | Son jeton d'accès reste valable jusqu'à 15 minutes (T1) | Patienter ; il ne peut plus se reconnecter |
| Un service Java s'arrête au démarrage (code 137 ou 139) | Mémoire insuffisante, ou rare plantage de la JVM (T8) | Relancer `docker compose up -d --wait`, et vérifier la mémoire allouée à Docker |
