# Limites connues, environnements testés et dépannage — HomeFlix

Ce document dit **honnêtement** ce que HomeFlix fait, ce qu'il ne fait pas encore, et dans quelles conditions il a été testé. Il complète le [README](../README.md) (installation, dépannage courant) et le [registre des risques](RISKS.md).

**État au 26/11/2026**, après la fusion de la synchronisation des téléchargements (#275), du profil conservé (#272), du responsive, de l'accessibilité et du premier lancement guidé. Chaque limite renvoie à une **issue** ou à un **choix** assumé du MVP.

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
| Écrans d'administration (comptes, dossiers, indexation, métadonnées, catalogue d'acquisition avec rappel des droits, annulation, état des services) et « Mon compte » | Recette visuelle du 25/11 sous Chrome sur la pile réelle : 39 points conformes, 1 écart de texte (#265), 4 points non livrés ou non testables (voir L1, L13, L14) |
| Acquisition P2P **de bout en bout depuis l'interface** : rappel des droits, progression, état « Terminé », film indexé, visible et lu | Essai du 25/11 à 22:51 (commit `4652b9f`) : Sintel, 129 241 752 octets, en moins d'une minute, sur le réseau de développement (#111) |
| Suppression de son compte : compte, profils, favoris et progression effacés | Vérifié le 26/11 dans les bases Identity et Library : 1 favori et 1 progression avant, 0 partout après (#97) |

## 2. Non livré ou incomplet

| # | Limite | Effet pour l'utilisateur | Issue ou décision |
|---|---|---|---|
| L1 | **Cas d'échec de la synchronisation non vérifiés ou imparfaits** : un téléchargement sans aucune source resterait probablement « En cours » (le code ne déclenche `NO_PEERS` que pour un torrent en file) ; tout refus de Library s'affiche « Library indisponible » ; les fichiers `.avi`, `.mov`, `.m4v` sont refusés par Library. | La synchronisation elle-même fonctionne (section 1). L'échec par arrêt du client BitTorrent n'a pas encore été rejoué depuis #275. | [#111](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/111) ; remarques de revue sur #275 |
| L2 | **Le transfert P2P réel n'a été essayé que sur le réseau de développement.** | Un réseau qui bloque BitTorrent ou un contenu sans pair ferait échouer la démonstration : garder le plan B (captures, vidéo) et revérifier sur le réseau de la soutenance. | #111 ; risques R11 et R12 de [`RISKS.md`](RISKS.md) |
| L3 | **Revue de l'agent IA non réalisée** : le rapport n'existe pas. | Le scénario 10 du plan d'acceptation est marqué « non fait ». | [#113](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/113) ; rôle décrit dans [`AI_AGENT_ROLE.md`](AI_AGENT_ROLE.md) |
| L4 | **L'installation n'a pas été essayée par une personne extérieure** au projet. | Le test à froid a été fait par un membre de l'équipe. | [#112](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/112) |
| L5 | **Les écrans d'administration** ont été recettés visuellement le 25/11 sous Chrome (section 1), **avant la refonte de leurs tableaux par #266** : cette nouvelle présentation n'a pas été rerecettée sur la pile réelle. Safari et un navigateur mobile réel n'ont pas été essayés. | Un défaut d'affichage des tableaux reste possible. | Recette des 4 tableaux à refaire ; #96 |
| L6 | **Les métadonnées** (titre, genre, année) **ne sont pas récupérées automatiquement** : elles se corrigent à la main dans l'écran d'administration (PR #251). Un film arrivé par téléchargement n'a que le titre du catalogue : ni année ni genre. | Corriger les métadonnées avant une démonstration, y compris après un téléchargement. | #84 (fermée) |
| L7 | **Pas d'affiches, pas de durée sur les cartes, pas de sous-titres** dans le lecteur. | Les cartes affichent un pictogramme à la place de l'affiche. | Choix du MVP : pas de récupération de métadonnées externes ni de sous-titres |
| L8 | **Profil actif après un renouvellement du jeton** : corrigé côté Identity (#272, test d'intégration), **pas encore revérifié dans le navigateur**. Le contournement du frontend (#243) est toujours en place. | À confirmer en recette (nouvel onglet, attente de 15 minutes). | [#222](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/222) (fermée) |
| L9 | **Un mot de passe réinitialisé par l'administrateur ne peut pas être changé** par son titulaire : aucune route de changement de mot de passe n'existe. | Le mot de passe temporaire reste valable indéfiniment. | [#223](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/223) |
| L10 | **Le profil actif n'apparaît pas dans l'en-tête**, et l'écran « Qui regarde ? » n'a pas de « Se déconnecter » (la maquette en prévoit un). | Il faut ouvrir le menu du compte, ou choisir un profil, pour se déconnecter. | [#242](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/242), [#255](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/255) |
| L12 | **Premier lancement guidé** livré (#278). Les états « indexation en cours » et « échouée » ne sont vérifiés que par les tests, et l'accueil ne se met pas à jour seul pendant une indexation. | Recharger la page pour voir les films. | #105 |
| L13 | **Un film retiré du catalogue ne peut pas être rajouté depuis l'écran** : l'entrée n'est pas recréée par les indexations suivantes (c'est annoncé dans la confirmation). | Pour retrouver le film : remise à zéro (`reset-demo.sh`) ou API. Ne jamais retirer un film de démonstration par erreur. | Choix de conception de l'écran « Médias » (#84) |
| L14 | **La confirmation d'annulation d'un téléchargement ne dit pas que les données déjà reçues restent sur le disque.** L'annulation en cours de route n'a pas été rejouée depuis #275. | Un fichier resté dans `/downloads` peut être indexé ensuite (doublon non détecté, #73). | #111 ; texte de la confirmation à préciser |

## 3. Limites techniques et de sécurité assumées

| # | Limite | Pourquoi, et ce qu'on a fait | Référence |
|---|---|---|---|
| T1 | **Une désactivation de compte prend effet au plus tard 15 minutes plus tard** pour une session déjà ouverte : le rôle est celui de l'émission du jeton. Le compte ne peut plus se reconnecter tout de suite. | Jeton d'accès de 15 minutes, non révocable avant son expiration. Constaté le 25/11 : une session ouverte répond encore après la désactivation, puis F5 la ferme. **La confirmation « Désactiver » dit à tort que les sessions sont fermées immédiatement** : [#265](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/265). | [`ARCHITECTURE.md`](ARCHITECTURE.md) §9 ; R6 |
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
- **Pas de transcodage, pas de sous-titres, pas d'affiches** (L7, T7).
- **Avance et retour** : par requêtes HTTP Range, vérifiées (réponses 206).

## 6. Environnements testés

| Environnement | État |
|---|---|
| Linux (Ubuntu, GitHub Actions) | Pile complète et tests à chaque pull request et à chaque modification de `main`. Interrompus du 23 au 24/11 par l'épuisement du quota de minutes (dépôt alors privé), rétablis le 24/11 |
| Linux sous WSL 2, Docker 29.9, Compose 5.7, 15 Go de mémoire | Poste de développement : installation à froid, parcours complet, sauvegarde et restauration |
| Chrome et Firefox | Recette du frontend du 24/11 (Firefox : connexion, catalogue, lecture, pause et reprise, plein écran, aucune erreur en console). Écrans d'administration recettés le 25/11 sous Chrome (Firefox : contrôle d'accès, session d'un compte désactivé, suppression de compte) |
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
