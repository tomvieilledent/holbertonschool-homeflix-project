# Plan d'acceptation : les 10 scénarios du sujet

Ce document décrit **comment** on vérifie, à la main et avec des preuves, que HomeFlix fait ce que le sujet demande. Pour chaque scénario : ce qu'on prépare, les étapes, le résultat attendu, la preuve à garder, ce qui est déjà automatisé et ce qui peut encore bloquer.

Les résultats de l'exécution iront dans `docs/ACCEPTANCE_REPORT.md` (un tableau par scénario : étapes, attendu, obtenu, preuve, statut). Ce plan ne contient **aucun résultat** : il dit seulement quoi faire et quoi attendre.

> **Vérification du plan.** Les commandes des scénarios 2, 3, 4, 5, 7, 8 et 9 ont été rejouées le 2026-11-23 sur `main` au commit `27379a7`, sur une pile remise à zéro par `reset-demo.sh`. Les scénarios 1, 6 et 10 dépendent de travaux qui ne sont pas encore livrés : leur état est indiqué honnêtement dans chaque section.

## Règles d'exécution

| Règle | Détail |
|---|---|
| **Version candidate** | Les 10 scénarios sont joués **sur le même commit**, identifié (tag ou empreinte de commit) et noté en tête du rapport. Un changement de code après coup oblige à rejouer les scénarios touchés. |
| **Machine** | Idéalement une machine propre (scénario 1). À défaut, la machine de démonstration, remise à zéro juste avant. Noter le système, la version de Docker et la mémoire. |
| **Preuves** | Une capture d'écran (dossier `docs/acceptance/`), la sortie d'une commande, ou un journal. Nommer chaque fichier `sNN-description.png` (NN = numéro du scénario). Jamais de mot de passe, de jeton ni de lien magnet dans une preuve. |
| **Statuts** | **Conforme** (attendu = obtenu), **Partiel** (une partie seulement, dire laquelle), **Non conforme** (l'attendu n'est pas obtenu), **Non exécuté** (dire pourquoi). |
| **Défauts** | Chaque écart donne une issue `type:bug` assignée, citée dans le rapport. Les limites connues (fin du document) sont **listées honnêtement**, pas cachées. |
| **Qui joue** | Une personne joue, une autre regarde et signe la ligne (les scénarios 1 et 10 demandent une personne qui ne les a pas préparés). |

## Préparer l'état de départ

```bash
cd homeflix
./scripts/gen-secrets.sh                  # une seule fois : crée .env
./scripts/fetch-demo-media.sh             # films libres dans demo-media/ (environ 250 Mo)
./scripts/reset-demo.sh --yes --build     # pile neuve + comptes de démonstration + films indexés
```

Le script affiche le mot de passe de démonstration (le même pour les trois comptes) et l'écrit dans `homeflix/.demo-credentials`. Comptes : `demo-admin` (administrateur), `demo-famille` (profils Alice et Bob), `demo-invite` (profil Invité). Détails : [`DEMO.md`](DEMO.md).

Les commandes de ce plan utilisent ces quelques lignes (à coller une fois dans le terminal) :

```bash
cd homeflix
BASE=http://localhost:8080
PW="$(sed -n 's/^mot_de_passe=//p' .demo-credentials)"
J='Content-Type: application/json'
login() { curl -s -X POST "$BASE/api/identity/v1/auth/login" -H "$J" \
  -d "{\"username\":\"$1\",\"password\":\"$PW\"}" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p'; }
ADMIN=$(login demo-admin); FAM=$(login demo-famille)
```

## Vue d'ensemble

| # | Scénario | Déjà automatisé | État prévu | Ce qui peut bloquer |
|---|---|---|---|---|
| 1 | Installer depuis le dépôt | Démarrage de la pile à chaque PR (test de fumée) | Fait par nous ; **reste l'essai par une personne extérieure** | #112 (PR #232 en relecture) |
| 2 | Configurer la bibliothèque, sans doublon | Tests d'intégration de l'indexation | Exécutable | Rien |
| 3 | Chercher et lire | Test E2E « connexion, profil, recherche et lecture » (#110) | Exécutable | Rien |
| 4 | Pause puis reprise | Test E2E « reprise de lecture » (#110) | Exécutable | Rien (#65 livrée) |
| 5 | Changer de profil | Test E2E « listes séparées », 83 contrôles de `INTEGRATION_J7.md` | Exécutable | Rien |
| 6 | Acquérir un contenu manquant | Aucun de bout en bout | **Partiel** : démarrage et annulation vérifiés, la suite attend #99 | #99, #95, #111 |
| 7 | Action non autorisée | 16 scénarios Identity, test E2E des accès, test de fumée | Exécutable | Rien |
| 8 | Redémarrer les conteneurs | `scripts/test-persistence.sh`, lancé par la CI | Exécutable | Rien |
| 9 | Fichier ou service indisponible | Tests d'intégration de la disponibilité | Exécutable | Rien |
| 10 | Revue de l'agent IA | Aucun | **Non fait** : le rapport n'existe pas | #113 |

---

## Scénario 1 : installer depuis le dépôt

**Objectif.** Une personne extérieure installe HomeFlix en suivant **uniquement** le README et arrive à regarder un film.

**Préparation.** Une machine avec Docker, Git et curl, sans pile HomeFlix. La personne ne connaît pas le projet. Un accès au dépôt (privé) lui est donné.

**Étapes.**
1. Cloner le dépôt, puis suivre les cinq étapes de la section 2 du README (secrets, films, démarrage, `/setup`). → *Attendu : `docker compose ps` affiche six services `healthy`.*
2. Créer l'administrateur sur `/setup`. → *Attendu : « Administrateur créé. Connectez-vous pour continuer. »*
3. Déclarer `/media`, indexer, créer un profil (README, section 3). → *Attendu : codes 201, 202, indexation `COMPLETED`.*
4. Se connecter, choisir le profil, lancer un film. → *Attendu : la vidéo se lit.*

**Preuves.** Le journal d'installation (`docs/INSTALLATION_TEST.md`), les durées relevées, les frictions de la personne, une capture du film en lecture.

**Déjà fait.** Un essai par l'équipe sur un clone neuf de `main` : il réussit sans aide (4 min 40 s à froid). Voir `INSTALLATION_TEST.md` (PR #232).

**Reste à faire.** L'essai par une personne extérieure, sur une machine propre. Tant qu'il n'est pas fait, ce scénario est **Partiel**.

---

## Scénario 2 : configurer la bibliothèque (films visibles, sans doublon)

**Objectif.** Un dossier de films déclaré donne un catalogue sans doublon, même après deux scans.

**Préparation.** Une pile **neuve** (sans `reset-demo.sh`, qui indexe déjà les films : son premier scan répondrait `added: 0`). Utiliser l'installation du scénario 1, avec `demo-media/` contenant deux films.

**Étapes.**
1. Déclarer le dossier :
   `curl -s -X POST "$BASE/api/library/v1/admin/media-roots" -H "Authorization: Bearer $ADMIN" -H "$J" -d '{"path":"/media","label":"Films"}'`
   → *Attendu : 201.*
2. Premier scan : `curl -s -X POST "$BASE/api/library/v1/admin/index" -H "Authorization: Bearer $ADMIN"` puis, quelques secondes après, `curl -s "$BASE/api/library/v1/admin/index/status" -H "Authorization: Bearer $ADMIN"`. → *Attendu : `"state":"COMPLETED"`, `"added":2`, `"duplicates":0`.*
3. Deuxième scan, même commandes. → *Attendu : `"added":0`, `"updated":0`, `"duplicates":0`.*
4. Ouvrir **Catalogue** dans l'interface. → *Attendu : exactement deux films, chacun une seule fois.*
5. Tenter de déclarer un dossier hors de la zone autorisée : `-d '{"path":"/etc","label":"x"}'`. → *Attendu : 400 `ROOT_NOT_ALLOWED`. Idem pour `/media/../etc`.*

**Preuves.** Les deux réponses de l'état d'indexation, la capture du catalogue, la réponse 400.

**Déjà automatisé.** Tests d'intégration de l'indexation (idempotence, sortie de dossier).

**Limite connue à connaître.** « Sans doublon » vaut pour **le même fichier scanné deux fois**. Un même film copié sous un autre nom ou dans un autre dossier **n'est pas reconnu comme doublon** (l'empreinte est taille, date et chemin ; issue #73). Ne pas le montrer comme une garantie.

---

## Scénario 3 : chercher et lire

**Objectif.** La recherche trouve un film, la lecture démarre et on peut avancer dans la vidéo (HTTP Range).

**Préparation.** Pile du scénario 2 ou pile de démonstration.

**Étapes (interface).**
1. Se connecter (`demo-famille`), choisir Alice, ouvrir **Catalogue**, saisir `sintel` dans « Rechercher un titre ». → *Attendu : une fiche, « Sintel ».*
2. Ouvrir la fiche, cliquer **Lecture**, puis **Lire**. → *Attendu : la vidéo démarre et le temps avance.*
3. Se déplacer dans la vidéo (barre de position). → *Attendu : la lecture reprend à l'endroit choisi, sans recharger.*

**Étapes (preuve réseau du « 206 »).**
```bash
ALICE=$(curl -s "$BASE/api/identity/v1/profiles" -H "Authorization: Bearer $FAM" | sed 's/{"id"/\n{"id"/g' | grep '"name":"Alice"' | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
TA=$(curl -s -X POST "$BASE/api/identity/v1/profiles/$ALICE/select" -H "Authorization: Bearer $FAM" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')
MEDIA=$(curl -s "$BASE/api/library/v1/media?q=sintel" -H "Authorization: Bearer $TA" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)
URL=$(curl -s -X POST "$BASE/api/library/v1/media/$MEDIA/stream-ticket" -H "Authorization: Bearer $TA" | sed -n 's/.*"url":"\([^"]*\)".*/\1/p')
curl -s -o /dev/null -D - -H 'Range: bytes=1000-1999' "$BASE$URL" | head -8
```
→ *Attendu : `HTTP/1.1 206`, `Accept-Ranges: bytes` et `Content-Range: bytes 1000-1999/<taille du fichier>`.*

**Preuves.** Capture de la recherche, capture du lecteur en cours de lecture, l'en-tête `206` ci-dessus.

**Déjà automatisé.** Le test E2E « connexion, profil, recherche et lecture » (déplacement dans la vidéo compris), le test de fumée.

---

## Scénario 4 : pause puis reprise

**Objectif.** Après une pause et une reconnexion, la position est retrouvée.

**Étapes (interface).**
1. Connecté en Alice, lancer *Sintel*, laisser lire environ 40 s, cliquer **Mettre en pause** (la pause enregistre la position).
2. Se déconnecter (menu du compte, « Se déconnecter »), se reconnecter, choisir Alice, ouvrir la fiche de *Sintel*. → *Attendu : le bouton affiche « Reprendre à 0:40 » environ, et la barre de progression est visible.*
3. Cliquer ce bouton. → *Attendu : la lecture reprend vers 0:40, pas à 0:00.*

**Étapes (preuve API).**
```bash
curl -s -X PUT "$BASE/api/library/v1/media/$MEDIA/progress" -H "Authorization: Bearer $TA" -H "$J" \
  -d '{"positionSeconds":754,"durationSeconds":888}'
# se reconnecter, reprendre un jeton de profil Alice, puis :
curl -s "$BASE/api/library/v1/media/$MEDIA/progress" -H "Authorization: Bearer $TA2"
```
→ *Attendu : `"positionSeconds":754`, `"state":"STARTED"`.*

**Preuves.** Capture « Reprendre à … » après reconnexion, réponse de la progression.

**Déjà automatisé.** Le test E2E « reprise de lecture » (sans la déconnexion, qui est ici montrée à la main).

**À savoir.** La position est envoyée toutes les 10 s, à la pause, à la fin et à la fermeture de l'onglet. À partir de 95 % de la durée, le film passe à `COMPLETED` et repart du début.

---

## Scénario 5 : changer de profil

**Objectif.** Deux profils d'un même compte ont des favoris et une progression **séparés**.

**Étapes (interface).**
1. Alice : ouvrir *Sintel*, **Ajouter à ma liste** (le bouton devient « Dans ma liste »), lancer la lecture 40 s puis pause. → *Attendu : « Dans ma liste » et « Reprendre à … » chez Alice.*
2. Menu du compte, **Changer de profil**, choisir Bob, ouvrir la fiche de *Sintel*. → *Attendu : « Ajouter à ma liste » et « Lecture » (aucune progression).*
3. Revenir sur Alice. → *Attendu : sa liste et sa progression sont intactes.*

**Étapes (preuve API).** Avec les jetons des deux profils (`TA` pour Alice, `TB` pour Bob, obtenus par `POST /profiles/{id}/select`) :
- `GET /api/library/v1/media/$MEDIA/progress` : Alice `STARTED`, Bob `NOT_STARTED`.
- `GET /api/library/v1/me/favourites` : Alice 1 favori, Bob 0.

**Isolation entre comptes.** Avec le jeton de `demo-invite` : `POST /api/identity/v1/profiles/$ALICE/select`. → *Attendu : 404 (le profil d'un autre compte n'existe pas pour lui).*

**Preuves.** Deux captures (fiche d'Alice, fiche de Bob), les réponses API.

**Déjà automatisé.** Le test E2E « listes séparées » ; `INTEGRATION_J7.md` (83 contrôles par l'API et 25 dans le navigateur).

**À savoir.** Gérer ses profils (créer, renommer, supprimer) se fait depuis « Gérer les profils » (limite de 5 par compte).

---

## Scénario 6 : acquérir un contenu manquant (P2P)

**Objectif.** Un administrateur télécharge en pair à pair un film **autorisé** ; il passe de « en cours » à « terminé », devient visible dans le catalogue et se lit.

**Préparation.**
- Pile de démonstration, mais **sans *Sintel* dans `demo-media/`** (retirer le fichier avant le reset) : le fichier téléchargé est le même film, et deux entrées identiques apparaîtraient sinon (limite de l'indexation, voir scénario 2).
- Vérifier la veille et le matin que le fichier est téléchargeable (`docs/legal/P2P_DEMO.md`, section « Avant la soutenance ») ; le P2P dépend de pairs extérieurs.

**Étapes.**
1. En administrateur, lire le rappel des droits : `GET $BASE/api/acquisition/v1/rights-notice`. Sans l'avoir acquitté, démarrer un téléchargement. → *Attendu : 412 `RIGHTS_NOT_ACKNOWLEDGED`.* (vérifié)
2. Acquitter : `POST .../rights-notice/ack` avec la version lue. → *Attendu : 200.* (vérifié)
3. Lister le catalogue fermé (`GET .../catalogue`) : une seule entrée, *Sintel*, avec sa source et sa licence CC BY 3.0 ; le lien magnet n'apparaît nulle part. (vérifié)
4. Démarrer : `POST .../downloads` avec `{"catalogueEntryId":"<id>"}`. → *Attendu : 202, état `DOWNLOADING`.* (vérifié)
5. Suivre : `GET .../downloads/<id>` régulièrement. → *Attendu : la progression avance puis l'état passe à `COMPLETED`.* **(bloqué : aucun code ne lit encore l'avancement de Transmission, issue #99)**
6. Le fichier apparaît dans `/downloads/complete`, Library l'indexe (dossier `/downloads`, déjà déclaré par `reset-demo.sh`), le film devient visible dans le catalogue puis lisible. **(bloqué : #99)**

**Cas à montrer en plus** (issue #111) : annuler un téléchargement (`POST .../downloads/<id>/cancel`, 200, état `CANCELLED`) et arrêter Transmission (`docker compose stop transmission`) pour obtenir 503 `TORRENT_CLIENT_UNAVAILABLE` avec le message « Le service de téléchargement est indisponible. ». (vérifiés)

**Preuves.** Les états observés (`DOWNLOADING` puis `COMPLETED`), la durée, une capture du film dans le catalogue puis en lecture, les journaux de Transmission.

**État.** Étapes 1 à 4 vérifiées sur `main`. L'étape 5 est **bloquée par #99** (synchronisation des états) et l'écran d'administration par #95. **Aucune simulation n'est acceptable en soutenance** : le scénario se joue avec un vrai téléchargement.

---

## Scénario 7 : action non autorisée

**Objectif.** Le serveur refuse ce qui n'est pas permis, quelle que soit l'interface.

**Étapes.** Avec `FAM` (utilisateur simple) et sans jeton :

| Action | Commande (résumé) | Attendu |
|---|---|---|
| Lire le catalogue sans jeton | `GET /api/library/v1/media` | 401 |
| Lister les comptes | `GET /api/identity/v1/admin/accounts` avec `FAM` | 403 |
| Lister les dossiers | `GET /api/library/v1/admin/media-roots` avec `FAM` | 403 |
| Lancer une indexation | `POST /api/library/v1/admin/index` avec `FAM` | 403 |
| Démarrer un téléchargement | `POST /api/acquisition/v1/downloads` avec `FAM` | 403 |
| Sélectionner le profil d'un autre compte | `POST /api/identity/v1/profiles/$ALICE/select` avec le jeton de `demo-invite` | 404 |
| Ticket de streaming modifié | `curl "$BASE${URL}x"` | 403 |
| Ticket d'un film utilisé sur un autre film | même ticket, autre identifiant de média | 403 |
| Routes internes et supervision depuis l'extérieur | `GET /api/library/internal/purge`, `GET /api/library/actuator/health` | 404 |

**Étape interface.** Connecté en `demo-famille`, ouvrir `/admin` (en passant par un lien de l'application, un rechargement ferait perdre le profil actif, issue #222). → *Attendu : « Accès refusé », et aucun lien « Administration » dans le menu.*

**Preuves.** Un tableau des codes obtenus (sortie des commandes) et la capture « Accès refusé ».

**Déjà automatisé.** `AuthorizationScenariosIntegrationTests` (jeton expiré, falsifié, `alg=none`, mauvaise clé, IDOR), le test E2E des accès, le test de fumée (un seul port ouvert) et `check-security-headers.sh`.

---

## Scénario 8 : redémarrer les conteneurs

**Objectif.** Comptes, catalogue et progression survivent à un redémarrage.

**Étapes.**
1. Créer une donnée reconnaissable : en Alice, enregistrer une position sur *Sintel* (scénario 4).
2. `docker compose restart`, attendre que les six services soient `healthy` (`docker compose ps`), se reconnecter. → *Attendu : la progression d'Alice est la même (`positionSeconds` identique), les deux films sont toujours dans le catalogue.*
3. `docker compose down` puis `docker compose up -d --wait`. → *Attendu : mêmes données.* (vérifié : 754 s retrouvées dans les deux cas)
4. **Ne jamais utiliser `down -v` pour ce scénario** : l'option supprime les volumes, donc les données. Pour le montrer, le faire sur une pile de test et constater la perte, puis relancer `reset-demo.sh`.

**Automatisé.** `./scripts/test-persistence.sh` rejoue ce scénario dans un projet Docker isolé, et son option `--simulate-loss` prouve que le test détecte une vraie perte. Il est lancé par la CI à chaque PR.

**Preuves.** La progression avant et après (sorties), la sortie de `test-persistence.sh`.

---

## Scénario 9 : fichier ou service indisponible

**Objectif.** Une panne produit un message **compréhensible**, jamais une page blanche ni une erreur technique.

**A. Fichier indisponible.**
1. Retirer *Sintel* du dossier `demo-media/` (côté machine, pas dans le conteneur : le montage est en lecture seule), relancer l'indexation. → *Attendu : `"markedUnavailable":1`.*
2. Ouvrir la fiche. → *Attendu : le film est « indisponible » avec son titre conservé, et pas de bouton de lecture.* Demander un ticket de streaming par l'API : *409 « Ce média n'est pas disponible pour le moment. ».*
3. Remettre le fichier, relancer l'indexation. → *Attendu : le film redevient disponible (`AVAILABLE`).*

**B. Service arrêté** (`docker compose stop <service>` puis `start`).

| Service arrêté | Action | Ce que voit l'utilisateur |
|---|---|---|
| `identity-service` | Se connecter | « Le service est momentanément indisponible. Réessayez dans un instant. » |
| `identity-service` | Utiliser l'application avec un jeton déjà émis | Fonctionne (Library vérifie les jetons seule) jusqu'à l'expiration du jeton (15 min) |
| `library-service` | Ouvrir l'accueil ou le catalogue | « Une erreur est survenue. Le service est momentanément indisponible. Réessayez dans un instant. » avec un bouton **Réessayer** |
| `transmission` | Démarrer un téléchargement | 503 `TORRENT_CLIENT_UNAVAILABLE` : « Le service de téléchargement est indisponible. » ; l'entrée n'est pas bloquée après le redémarrage |

**C. Voir l'état des services** (quand #81 est fusionnée) : `GET /api/identity/v1/admin/system/status` avec `ADMIN`. → *Attendu : `DEGRADED`, avec le service arrêté en `DOWN`.*

**Preuves.** Captures des messages (fiche indisponible, connexion sans Identity, accueil sans Library), réponses 409 et 503.

**À savoir.** Par l'API directe, un service arrêté donne la page HTML « 502 Bad Gateway » de nginx : c'est l'interface qui la traduit en message clair. Ne pas présenter la réponse brute comme un message d'erreur.

---

## Scénario 10 : revue de l'agent IA

**Objectif.** Montrer qu'un agent IA a reçu une mission écrite, qu'il a produit un rapport, et qu'un humain a vérifié chacun de ses constats.

**Étapes.**
1. Montrer la mission écrite : `docs/AI_AGENT_ROLE.md` (objectif, entrées autorisées, outils autorisés, limites, livrable, revue) et `docs/WORKING_AGREEMENT.md`, section 8.
2. Lancer l'agent sur les entrées autorisées ; son rapport est `docs/ai-review/REPORT.md` (constats `AI-01`, `AI-02`, … avec gravité, référence `fichier:ligne`, preuve de reproduction, correction suggérée).
3. Pour **chaque** constat : un humain le reproduit, puis l'**accepte** ou le **rejette avec une justification écrite**.
4. Un constat accepté donne une PR relue, avec la mention « Constat AI-NN (agent IA), vérifié par … ».
5. En soutenance, montrer **un constat accepté et un constat rejeté**.

**Preuves.** Le rapport, le tableau des décisions humaines, la PR liée à un constat accepté.

**État.** **Non fait** : le rapport n'existe pas (issue #113). C'est l'une des contraintes éliminatoires du sujet : ce scénario est **Non exécuté** tant que le rapport et sa relecture ne sont pas écrits.

---

## Modèle pour le rapport

À reproduire dans `docs/ACCEPTANCE_REPORT.md`, une ligne par étape :

| Étape | Attendu | Obtenu | Preuve | Statut |
|---|---|---|---|---|
| S2.3 Deuxième scan | `added: 0`, `duplicates: 0` | | `acceptance/s02-scan2.txt` | |

En tête du rapport : version candidate (commit ou tag), date, machine, personne qui joue, personne qui signe.

## Limites connues à lister honnêtement

À reprendre dans le rapport (colonne « défauts connus »), avec l'issue quand elle existe :

| Limite | Effet sur les scénarios | Issue |
|---|---|---|
| Un rechargement de page (F5) fait perdre le profil actif : retour sur « Qui regarde ? » | Un clic de plus (3, 4, 5, 7) | #222 |
| Un mot de passe temporaire ne peut jamais être changé | Hors scénarios, mais écart de sécurité | #223 |
| Un compte désactivé garde l'accès à l'API jusqu'à 15 minutes avec un jeton déjà émis | Hors scénarios | Écart E4 de `INTEGRATION_J7.md` (contrat à préciser) |
| La suppression de compte ne purge pas encore Acquisition | Hors scénarios | #97 |
| Un même film copié sous un autre nom n'est pas détecté comme doublon | Scénarios 2 et 6 | #73 |
| Les titres sont les noms de fichier tant que les métadonnées ne sont pas corrigées (le script de démonstration les corrige) | Scénarios 2 et 3 | #84 |
| Pas de HTTPS dans l'application (HTTP simple sur le port 8080) | Hors scénarios | README, section 6 (« Non testé ») |
| Un service Java plante parfois au démarrage (cause inconnue, réessai automatique) | Durée du reset (`DEMO.md`) | — |
| Le téléchargement P2P dépend de pairs extérieurs, donc de la durée et de la réussite | Scénario 6 | `P2P_DEMO.md` |
| Les noms de profil sont sensibles à la casse (« Alice » et « alice » coexistent) | Scénario 5 | — |
| L'intro animée du logo dure jusqu'à 7 s à chaque nouvelle session (si #239 est fusionnée) | Début de tous les scénarios en interface | #239 |
