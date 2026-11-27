# Rapport d'acceptation : les 10 scénarios du sujet

> **État : passage final joué le 27/11/2026, en attente de la signature d'une seconde personne.** Les résultats qui valent acceptation sont dans [« Passage final »](#passage-final-du-27112026). Les tableaux par scénario plus bas gardent les résultats préliminaires des 23 au 26/11. Les étapes et les résultats attendus viennent de [`ACCEPTANCE_PLAN.md`](ACCEPTANCE_PLAN.md).

| | |
|---|---|
| **Version candidate** (commit ou tag) | `5609c56` (`main` du 27/11) |
| **Date du passage final** | 27/11/2026 |
| **Machine** (système, Docker, mémoire) | Linux sous WSL 2 (noyau 6.6), Docker 29.9.3, Compose 5.7.1, 15 Gio |
| **Personne qui joue** | Haitu (parcours à l'écran) ; contrôles par l'API : script automatisé sur une pile séparée du même poste |
| **Personne qui signe** | _à remplir_ |

**Statuts :** **Conforme** (attendu = obtenu) · **Partiel** (une partie seulement, laquelle) · **Non conforme** · **Non exécuté** (pourquoi). Un statut suivi de « (préliminaire) » est à confirmer au passage final.

## Synthèse

| # | Scénario | Statut | Passage final | Ce qui manque |
|---|---|---|---|---|
| 1 | Installer depuis le dépôt | **Partiel** | **Partiel** | Essai par une personne extérieure ([#112](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/112)) |
| 2 | Configurer la bibliothèque, sans doublon | Conforme | Conforme |  |
| 3 | Chercher et lire | Conforme | Conforme |  |
| 4 | Pause puis reprise | Conforme | Conforme |  |
| 5 | Changer de profil | Conforme | Conforme |  |
| 6 | Acquérir un contenu manquant (P2P) | Conforme | Conforme | État « En file d'attente » non observé (trop bref) |
| 7 | Action non autorisée | Conforme | Conforme |  |
| 8 | Redémarrer les conteneurs | Conforme | Conforme |  |
| 9 | Fichier ou service indisponible | Conforme | Conforme | Library arrêté : message après environ 60 s |
| 10 | Revue de l'agent IA | Conforme | Conforme | Non rejoué : documents inchangés |

**Automatisation déjà en place :** tests d'intégration des services, tests Playwright du parcours principal (`homeflix/e2e`, #110), test de fumée de la pile complète, `scripts/test-persistence.sh` et `scripts/test-backup-restore.sh`, lancés par la CI.

## Passage final du 27/11/2026

Commit `5609c56`. Deux volets : des **contrôles par l'API** joués par un script sur une pile neuve et séparée (résumé : [`s00-passage-final-api.txt`](acceptance/s00-passage-final-api.txt), aucun écart), puis le **parcours à l'écran** sur la pile de démonstration reconstruite.

| # | Par l'API | À l'écran | Preuves | Statut |
|---|---|---|---|---|
| 1 | Clone neuf, `gen-secrets`, construction (couches Docker en cache), 6 services `healthy`, `/setup` 201 | Remise à zéro avec reconstruction : 6 services `healthy` | [`s01-installation.txt`](acceptance/s01-installation.txt) | **Partiel** : joué par l'équipe, pas par une personne extérieure |
| 2 | 201 ; premier scan : 2 ajoutés ; second : 0 ajouté, 0 mis à jour, 0 doublon ; `/etc` et `/media/../etc` : 400 | Deux films au catalogue, chacun une fois | [`s02-root.txt`](acceptance/s02-root.txt), [`s02-scan1.txt`](acceptance/s02-scan1.txt), [`s02-scan2.txt`](acceptance/s02-scan2.txt), [`s02-400.txt`](acceptance/s02-400.txt), [`s02-catalogue.png`](acceptance/s02-catalogue.png) | Conforme |
| 3 | Recherche : 1 résultat ; lecture partielle : 206 | Recherche, lecture, déplacement dans la vidéo | [`s03-206.txt`](acceptance/s03-206.txt), [`s03-recherche.png`](acceptance/s03-recherche.png), [`s03-position-apres-deplacement.png`](acceptance/s03-position-apres-deplacement.png) | Conforme |
| 4 | Position 754 s retrouvée après reconnexion, état `STARTED` | Après déconnexion : « Reprendre à 6:52 », la lecture repart de là | [`s04-reprise-api.txt`](acceptance/s04-reprise-api.txt), [`s04-reprise.png`](acceptance/s04-reprise.png), [`s04-lecture-reprise.png`](acceptance/s04-lecture-reprise.png) | Conforme |
| 5 | Bob : `NOT_STARTED`, 0 favori ; Alice : 1 favori | Bob ne voit ni la progression ni « Ma liste » d'Alice | [`s05-profils-api.txt`](acceptance/s05-profils-api.txt), [`s05-alice.png`](acceptance/s05-alice.png), [`s05-bob.png`](acceptance/s05-bob.png) | Conforme |
| 6 | 412 sans rappel acquitté, puis 200, 202, 409, annulation `CANCELLED`, client arrêté 503 ; aucun lien magnet exposé | Voir ci-dessous | [`s06-412.txt`](acceptance/s06-412.txt), [`s06-api.txt`](acceptance/s06-api.txt), [`s06-21-passage-final-termine.png`](acceptance/s06-21-passage-final-termine.png), [`s06-22-passage-final-pairs.txt`](acceptance/s06-22-passage-final-pairs.txt) | Conforme |
| 7 | 401, 403, 404 conformes ; tickets modifiés ou détournés : 403 | `/admin` avec `demo-famille` : « Accès refusé » | [`s07-codes.txt`](acceptance/s07-codes.txt), [`s07-acces-refuse.png`](acceptance/s07-acces-refuse.png) | Conforme |
| 8 | Position et films identiques après `restart`, puis après `down` et `up` | | [`s08-restart.txt`](acceptance/s08-restart.txt) | Conforme |
| 9 | Fichier retiré : 1 manquant, ticket 409, retour `AVAILABLE` ; état des services `DEGRADED` | Fiche « Indisponible » puis retour ; messages clairs avec Library puis Identity arrêtés | [`s09-scan.txt`](acceptance/s09-scan.txt), [`s09-services.txt`](acceptance/s09-services.txt), [`s09-indexation.png`](acceptance/s09-indexation.png), [`s09-fiche.png`](acceptance/s09-fiche.png), [`s09-retour.png`](acceptance/s09-retour.png), [`s09-library.png`](acceptance/s09-library.png), [`s09-library-retour.png`](acceptance/s09-library-retour.png), [`s09-identity.png`](acceptance/s09-identity.png) | Conforme |
| 10 | | Non rejoué : rapport et décisions inchangés | [`ai-review/REPORT.md`](ai-review/REPORT.md) | Conforme |

**Scénario 6, le vrai transfert.** *Sintel* retiré de `demo-media/` avant la remise à zéro ; aucun dossier `/downloads/complete`. Pendant le transfert : jusqu'à 17 pairs, données reçues de 14, jusqu'à 8 Mo/s ; l'onglet du navigateur a été fermé sans interrompre le téléchargement. Après : « Terminé », film lu depuis le catalogue, `Sintel.mp4` de 129 241 752 octets dont l'empreinte SHA-256 est celle documentée dans [`P2P_DEMO.md`](legal/P2P_DEMO.md). Réseau : le réseau domestique d'où la soutenance sera présentée.

**Réserves.**
- Scénario 9 : Library arrêté, le proxy répond 504 au bout d'environ 60 s (mesuré par l'API ; non chronométré à l'écran).
- Scénario 4 : reprise vérifiée à 6:52 au lieu de 0:40.
- Scénario 6 : les états « En cours » et « Terminé » ont été observés ici ; « Échoué » et « Annulé » les 26/11 et, par l'API, au passage final. « En file d'attente » n'a pas été observé.

## Scénario 1 : installer depuis le dépôt

**Statut : Partiel.** Réussi par un membre de l'équipe, pas par une personne extérieure.

| Étape | Attendu | Obtenu (préliminaire) | Preuve | Statut |
|---|---|---|---|---|
| S1.1 Cloner puis suivre les cinq étapes du README | Six services `healthy` | Six services `healthy`, 4 min 40 s à froid (23/11, commit `56b776f`) | [`INSTALLATION_TEST.md`](INSTALLATION_TEST.md) | Conforme |
| S1.2 Créer l'administrateur sur `/setup` | « Administrateur créé. Connectez-vous pour continuer. » | Conforme | [`installation/02-setup.png`](installation/02-setup.png) | Conforme |
| S1.3 Déclarer `/media`, indexer, créer un profil | 201, 202, indexation `COMPLETED` | 201, 202, `COMPLETED`, 2 films ajoutés | `INSTALLATION_TEST.md` | Conforme |
| S1.4 Se connecter, choisir le profil, lancer un film | La vidéo se lit | Vidéo de 596 s lue, déplacement à 200 s | [`installation/09-lecture.png`](installation/09-lecture.png) | Conforme |
| S1.5 Essai par une personne extérieure, sans aide | Réussite jusqu'à la première lecture | _non fait_ | _à produire_ | Non exécuté |

## Scénario 2 : configurer la bibliothèque

**Statut : Conforme (préliminaire).** À rejouer sur une pile **neuve** : la pile de démonstration a déjà son dossier déclaré et ses films indexés.

| Étape | Attendu | Obtenu (préliminaire) | Preuve | Statut |
|---|---|---|---|---|
| S2.1 Déclarer `/media` | 201 | _à rejouer sur pile neuve_ | [`acceptance/s02-root.txt`](acceptance/s02-root.txt) | |
| S2.2 Premier scan | 202, puis `COMPLETED` | 202, puis `COMPLETED` (23/11) | [`acceptance/s02-scan1.txt`](acceptance/s02-scan1.txt) | Conforme (préliminaire) |
| S2.3 Deuxième scan | `added: 0`, `updated: 0`, `duplicates: 0` | `added: 0` (23/11 et 24/11) | [`acceptance/s02-scan2.txt`](acceptance/s02-scan2.txt) | Conforme (préliminaire) |
| S2.4 Catalogue dans l'interface | Deux films, chacun une fois | Deux films (API et interface) | [`acceptance/s02-catalogue.png`](acceptance/s02-catalogue.png) | Conforme (préliminaire) |
| S2.5 Dossier hors zone (`/etc`, `/media/../etc`) | 400 `ROOT_NOT_ALLOWED` | 400 | [`acceptance/s02-400.txt`](acceptance/s02-400.txt) | Conforme (préliminaire) |

## Scénario 3 : chercher et lire

**Statut : Conforme (préliminaire).** Chrome et Firefox, recette du 24/11.

| Étape | Attendu | Obtenu (préliminaire) | Preuve | Statut |
|---|---|---|---|---|
| S3.1 Rechercher « sintel » | Une fiche, « Sintel » | Une fiche | [`acceptance/s03-recherche.png`](acceptance/s03-recherche.png) | Conforme (préliminaire) |
| S3.2 Cliquer Lecture, puis Lire | La vidéo démarre, le temps avance | Lecture, avec son | `acceptance/s03-lecture.png` _(à produire)_ | Conforme (préliminaire) |
| S3.3 Se déplacer dans la vidéo | Reprise à l'endroit choisi, sans recharger | Réponses `206`, en-têtes `Content-Range` et `Accept-Ranges` présents | [`acceptance/s03-206.txt`](acceptance/s03-206.txt) | Conforme (préliminaire) |

## Scénario 4 : pause puis reprise

**Statut : Conforme (préliminaire).**

| Étape | Attendu | Obtenu (préliminaire) | Preuve | Statut |
|---|---|---|---|---|
| S4.1 Lire environ 40 s, mettre en pause | Position enregistrée | Enregistrée | | Conforme (préliminaire) |
| S4.2 Se déconnecter, se reconnecter, ouvrir la fiche | « Reprendre à 0:40 » environ, barre de progression visible | « Reprendre à 0:40 » (± 2 s) et barre visible | [`acceptance/s04-reprise.png`](acceptance/s04-reprise.png) | Conforme (préliminaire) |
| S4.3 Cliquer ce bouton | La lecture reprend vers 0:40 | Reprise vers 0:40 | | Conforme (préliminaire) |

## Scénario 5 : changer de profil

**Statut : Conforme (préliminaire).**

| Étape | Attendu | Obtenu (préliminaire) | Preuve | Statut |
|---|---|---|---|---|
| S5.1 Alice : ajouter à la liste, lire 40 s, pause | « Dans ma liste » et « Reprendre à… » | Conforme | [`acceptance/s05-alice.png`](acceptance/s05-alice.png) | Conforme (préliminaire) |
| S5.2 Changer de profil, Bob, fiche de Sintel | « Ajouter à ma liste » et « Lecture » | Conforme : aucune donnée d'Alice | [`acceptance/s05-bob.png`](acceptance/s05-bob.png) | Conforme (préliminaire) |
| S5.3 Revenir sur Alice | Liste et progression intactes | Intactes | | Conforme (préliminaire) |

## Scénario 6 : acquérir un contenu manquant (P2P)

**Statut : Partiel.** Les étapes 1 à 4 sont vérifiées par l'API ; les étapes 5 à 8 depuis l'interface les 25 et 26/11 (commit `4652b9f`, étape 8 rejouée après #282). Reste l'essai sur le réseau de la soutenance.

| Étape | Attendu | Obtenu (préliminaire) | Preuve | Statut |
|---|---|---|---|---|
| S6.1 Démarrer sans avoir acquitté le rappel des droits | 412 `RIGHTS_NOT_ACKNOWLEDGED` | 412 | [`acceptance/s06-412.txt`](acceptance/s06-412.txt) | Conforme (préliminaire) |
| S6.2 Acquitter la bonne version du rappel | 200 | 200 ; mauvaise version 409, version absente 400 | | Conforme (préliminaire) |
| S6.3 Lister le catalogue fermé | Une entrée (Sintel), source et licence CC BY 3.0, aucun lien magnet | Conforme | | Conforme (préliminaire) |
| S6.4 Démarrer un téléchargement | 202, `DOWNLOADING` | 202, `DOWNLOADING` ; second démarrage 409 ; annulation `CANCELLED` ; panne de Transmission 503 puis reprise | `INTEGRATION_J7.md` | Conforme (préliminaire) |
| S6.5 Suivre jusqu'à `COMPLETED` | La progression avance, état final `COMPLETED` | Progression visible sans recharger (20 % relevé), « Terminé » à 100 % en moins d'une minute (25/11) | `acceptance/s06-03-progression-20-pourcent.png`, `s06-04-etat-termine-100-pourcent.png` | Conforme (préliminaire) |
| S6.6 Le fichier est indexé, visible puis lisible | Film dans le catalogue et lisible | Sintel dans « Médias » et sur l'accueil (« Disponible »), lecture démarrée, durée 14:48 ; ni année ni genre | `acceptance/s06-05-sintel-dans-medias.png`, `s06-06-sintel-accueil.png`, `s06-07-lecture-sintel.png` | Conforme (préliminaire) |
| S6.7 Annuler en cours de route | État `CANCELLED`, aucun film ajouté | Annulé à 60 % ; aucune donnée dans `/downloads` ; Sintel absent de la bibliothèque (26/11) | `acceptance/s06-08-annulation.png`, `s06-09-annulation-medias-sans-sintel.png` | Conforme (préliminaire) |
| S6.8 Arrêter le client BitTorrent pendant un transfert | État `FAILED`, message lisible, relance possible | « Échoué » à 53 % avec « Le service de téléchargement est injoignable. » ; après redémarrage, liste des torrents vide et aucune donnée dans `/downloads` ; relance depuis zéro réussie, film indexé (26/11, après #282) | `acceptance/s06-14-echec-apres-correctif.png`, `s06-15-relance-apres-echec.png`, `s06-16-sintel-apres-relance.png` | Conforme (préliminaire) |

## Scénario 7 : action non autorisée

**Statut : Conforme (préliminaire).**

| Étape | Attendu | Obtenu (préliminaire) | Preuve | Statut |
|---|---|---|---|---|
| S7.1 Catalogue sans jeton | 401 | 401 | [`acceptance/s07-codes.txt`](acceptance/s07-codes.txt) | Conforme (préliminaire) |
| S7.2 Lister les comptes avec un compte utilisateur | 403 | 403 | | Conforme (préliminaire) |
| S7.3 Lister les dossiers avec un compte utilisateur | 403 | 403 | | Conforme (préliminaire) |
| S7.4 Lancer une indexation avec un compte utilisateur | 403 | 403 | | Conforme (préliminaire) |
| S7.5 Démarrer un téléchargement avec un compte utilisateur | 403 | 403 | | Conforme (préliminaire) |
| S7.6 Sélectionner le profil d'un autre compte | 404 | 404 | | Conforme (préliminaire) |
| S7.7 Ticket de streaming modifié | 403 | 403 (mesuré le 24/11) | | Conforme (préliminaire) |
| S7.8 Ticket d'un film utilisé sur un autre film | 403 | 403 | | Conforme (préliminaire) |
| S7.9 Routes internes et supervision depuis l'extérieur | 404 | 404 (`/internal/purge`, `/actuator/health`) | | Conforme (préliminaire) |
| S7.10 Interface : ouvrir `/admin` avec un compte utilisateur | « Accès refusé », pas de lien « Administration » | Conforme | [`acceptance/s07-acces-refuse.png`](acceptance/s07-acces-refuse.png) | Conforme (préliminaire) |

Contrôles complémentaires faits le 24/11 : compte désactivé refusé (403 `ACCOUNT_DISABLED`), suppression refusée du dernier administrateur (409 `LAST_ADMIN`).

## Scénario 8 : redémarrer les conteneurs

**Statut : Conforme (préliminaire).**

| Étape | Attendu | Obtenu (préliminaire) | Preuve | Statut |
|---|---|---|---|---|
| S8.1 Enregistrer une position pour Alice | Donnée reconnaissable | 754 s | | Conforme (préliminaire) |
| S8.2 `docker compose restart`, six services `healthy`, reconnexion | Même position, deux films | Position et films identiques | [`acceptance/s08-restart.txt`](acceptance/s08-restart.txt) | Conforme (préliminaire) |
| S8.3 `docker compose down` puis `up -d --wait` | Mêmes données | 754 s retrouvées | `test-persistence.sh` (CI) | Conforme (préliminaire) |

## Scénario 9 : fichier ou service indisponible

**Statut : Conforme (préliminaire).**

| Étape | Attendu | Obtenu (préliminaire) | Preuve | Statut |
|---|---|---|---|---|
| S9.1 Retirer un film, relancer l'indexation | `"markedUnavailable":1` | Film marqué indisponible | [`acceptance/s09-scan.txt`](acceptance/s09-scan.txt) | Conforme (préliminaire) |
| S9.2 Ouvrir la fiche ; demander un ticket de streaming | « Indisponible », titre conservé, pas de bouton de lecture ; 409 | Conforme | [`acceptance/s09-fiche.png`](acceptance/s09-fiche.png) | Conforme (préliminaire) |
| S9.3 Remettre le fichier, relancer l'indexation | `AVAILABLE` | Redevient disponible | | Conforme (préliminaire) |
| S9.4 Arrêter `identity-service` | Message « Le service est momentanément indisponible » à la connexion | Conforme | [`acceptance/s09-identity.png`](acceptance/s09-identity.png) | Conforme (préliminaire) |
| S9.5 Arrêter `library-service` | Message d'erreur et bouton **Réessayer** ; retour à la normale après relance | Conforme | [`acceptance/s09-library.png`](acceptance/s09-library.png) | Conforme (préliminaire) |

## Scénario 10 : revue de l'agent IA

**Statut : Conforme (préliminaire).** Rapport dans [`ai-review/REPORT.md`](ai-review/REPORT.md) (#289).

| Étape | Attendu | Obtenu (préliminaire) | Preuve | Statut |
|---|---|---|---|---|
| S10.1 Mission écrite | Objectif, entrées, outils, limites, livrable, revue | Écrite | `AI_AGENT_ROLE.md` | Conforme |
| S10.2 Rapport de l'agent | `docs/ai-review/REPORT.md`, constats numérotés | 14 constats (AI-01 à AI-14) | `ai-review/REPORT.md` | Conforme |
| S10.3 Décision humaine sur chaque constat | Accepté, ou rejeté avec justification | 12 acceptés, 1 à clarifier (AI-12, tranché par #313), 1 rejeté (AI-14), décisions validées par Tom | `ai-review/REPORT.md`, « Tableau de suivi » | Conforme |
| S10.4 PR liée à un constat accepté | Mention « Constat AI-NN, vérifié par … » | « Constat AI-01 (agent IA), vérifié par Tom » ; AI-01 reproduit puis corrigé, seconde relecture par Haitu | [#286](https://github.com/tomvieilledent/holbertonschool-homeflix-project/pull/286) | Conforme |

## Complément : recette visuelle des écrans d'administration (25/11/2026)

Passage manuel sous Chrome (Firefox pour les sessions et le contrôle d'accès) sur la pile réelle remise à zéro, commit `32d952b`. Il complète les scénarios 2, 6, 7 et 9, vérifiés surtout par l'API. Résultat : **39 points conformes, 1 écart de texte, 4 points non livrés ou non testables.**

| Domaine | Vérifié | Statut |
|---|---|---|
| Accès | Bouton « Administration » réservé au rôle ADMIN ; `/admin/comptes` avec `demo-invite` : « Accès refusé » ; `/compte` sans session : redirection vers la connexion | Conforme |
| Comptes | Création (champs obligatoires, doublon), promotion et rétrogradation avec confirmation, désactivation puis réactivation, suppression ; administrateur actuel verrouillé | Conforme |
| Connexion d'un compte désactivé ou inexistant | Même message « Identifiant ou mot de passe incorrect. » avec un mauvais mot de passe ; message « Ce compte est désactivé » seulement avec le bon | Conforme |
| Session d'un compte désactivé | Elle répond encore jusqu'au prochain rechargement (jeton de 15 min), F5 la ferme ; la confirmation annonçait à tort une fermeture « immédiate » (texte corrigé depuis par #317) | **Écart de texte** ([#265](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/265)) |
| Dossiers médias | Chemin vide, introuvable, hors zone (`/etc`), déjà couvert : messages clairs ; retrait et ajout de `/downloads` | Conforme |
| Indexation | Compteurs, aucun doublon, bouton désactivé pendant l'exécution, fichiers intacts | Conforme (rechargement en cours d'indexation : non testé) |
| Médias | Recherche, état vide, modification (titre visible côté utilisateur), année invalide refusée, retrait sans suppression du fichier | Conforme |
| Acquisition | Catalogue fermé sans champ de saisie, preuve de licence, rappel des droits obligatoire avant démarrage, annulation | Conforme |
| Suivi du téléchargement | Ligne créée, mais **reste « En cours » à 0 %** alors que Transmission avait terminé (124 Mo reçus) | **Non livré** ([#99](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/99)) à cette date, **livré ensuite par #275** (voir scénario 6) |
| Services | Trois services opérationnels ; Acquisition arrêtée : état général « Dégradé », Acquisition « Hors service », les deux autres inchangés ; retour à la normale après relance | Conforme |
| « Mon compte » | Informations, confirmation par mot de passe, mauvais mot de passe refusé sans fermer la session, suppression effective | Conforme (purge côté Library vérifiée le 26/11 dans la base : tout à 0, [#97](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/97)) |

Preuves à ranger dans `acceptance/` : captures des écrans ci-dessus (sans mot de passe ni jeton).

## Complément : recette après les fusions du 26/11

Passage manuel sur la pile réelle remise à zéro, commit `12d033e`. Il porte sur les principales nouveautés visibles du jour (ni l'échec sans pair #306, ni les titres terminés #310) et ne remplace pas le passage final.

| # | Vérifié | Obtenu | Preuve | Statut |
|---|---|---|---|---|
| R1 | Durée des films (#305) | « 10 min » et « 15 min » sur l'accueil, dans « Médias » et sur les fiches | [`s02-duree-accueil.png`](acceptance/s02-duree-accueil.png) | Conforme |
| R2 | Pause puis reprise | « Reprendre à 2:00 » et barre de progression ; F5 conserve le profil (compte à deux profils) | [`s04-reprendre-a-2-00.png`](acceptance/s04-reprendre-a-2-00.png) | Conforme |
| R3 | Téléchargement visible dans le catalogue (#307) | « En téléchargement », puis « Terminé » à 100 % | [`s06-17-en-telechargement.png`](acceptance/s06-17-en-telechargement.png) | Conforme |
| R4 | Film déjà téléchargé (#308) | « Dans la bibliothèque · Voir » à la place de « Télécharger » | [`s06-18-dans-la-bibliotheque.png`](acceptance/s06-18-dans-la-bibliotheque.png) | Conforme |
| R4 bis | Retélécharger un film retiré | « Échoué » à 0 %, refus de Library (409) | [`s06-19-retelechargement-refuse.png`](acceptance/s06-19-retelechargement-refuse.png) | **Non conforme** à ce commit ([#316](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/316), corrigé ensuite par #321, vérifié ci-dessous) |
| R5 | Annulation en cours de route (#307) | Aucune fiche « Sintel » au catalogue | | Conforme |
| R6 | Mot de passe réinitialisé (#274, #315) | Changement imposé ; mauvais mot de passe actuel refusé ; ancien temporaire refusé après le changement | [`s07-changement-impose.png`](acceptance/s07-changement-impose.png) | Conforme |
| R7 | Compte désactivé avec une session ouverte (#314) | Au changement de profil : retour à la connexion avec « Ce compte est désactivé » | [`s07-compte-desactive.png`](acceptance/s07-compte-desactive.png) | Conforme |
| R8 | Suppression d'un compte (#309) | Favoris, progression, acquittement et compte : 1 avant, 0 après ; 1 téléchargement conservé, anonymisé | Comptages dans les trois bases | Conforme |

### Après #321, #322 et #312 (26/11, soir)

Pile reconstruite et remise à zéro, commit `ec117da`.

| # | Vérifié | Obtenu | Preuve | Statut |
|---|---|---|---|---|
| E1 | Affiches (#312) | Affiches des deux films de `/media` sur l'accueil, le catalogue et la fiche | [`s03-affiches.png`](acceptance/s03-affiches.png) | Conforme |
| E2 | Retélécharger un film téléchargé puis retiré (#321) | Second téléchargement « Terminé », film de retour au catalogue et lu | [`s06-20-retelechargement-termine.png`](acceptance/s06-20-retelechargement-termine.png) | Conforme |
| E3 | Retirer puis rajouter `/media`, puis indexer (#322) | 0 film ajouté, 0 doublon ; le film retiré auparavant ne revient pas ; « Ma liste » et la reprise à 1:01 conservées | [`s02-dossier-rajoute-indexation.png`](acceptance/s02-dossier-rajoute-indexation.png), [`s02-dossier-rajoute-medias.png`](acceptance/s02-dossier-rajoute-medias.png) | Conforme |

## Défauts connus

À lire avec [`KNOWN_LIMITS.md`](KNOWN_LIMITS.md), qui détaille chaque limite.

| Défaut | Effet sur les scénarios | Issue |
|---|---|---|
| Un compte désactivé garde l'accès jusqu'à 15 minutes avec un jeton déjà émis | Hors scénarios | `ARCHITECTURE.md` §9 |
| Un film retiré du catalogue ne peut pas être rajouté depuis l'écran | Scénario 2 (si retrait par erreur) | `KNOWN_LIMITS.md` L13 |
| Les doublons de contenu ne sont pas détectés | Scénarios 2 et 6 | [#73](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/73) |
| Titres affichés = noms de fichier tant que les métadonnées ne sont pas corrigées | Scénarios 2 et 3 | [#84](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/84) |
| Pas de HTTPS dans l'application | Hors scénarios | README, section 6 |
| Un service Java plante parfois au démarrage (réessai automatique) | Durée du reset | `DEMO.md` |
| Library arrêté : le message d'erreur n'arrive qu'après environ 60 s | Scénario 9 | `KNOWN_LIMITS.md` L23 |
| Le P2P dépend de pairs extérieurs | Scénario 6 | `legal/P2P_DEMO.md` |
| Profil actif absent de l'en-tête | Confort | [#242](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/242) |

## Preuves

Les fichiers cités se rangent dans `docs/acceptance/`, nommés `sNN-description` (NN = numéro du scénario). Aucune preuve ne doit montrer de mot de passe, de jeton ni de lien magnet.

## Signature

| Rôle | Nom | Date | Signature |
|---|---|---|---|
| Joue les scénarios | | | |
| Relit et signe | | | |
