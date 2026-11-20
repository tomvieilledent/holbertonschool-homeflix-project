# HomeFlix

HomeFlix est une plateforme de streaming **auto-hébergée** pour un foyer : vous pointez le logiciel vers un dossier de films, chaque membre de la famille a un compte et ses profils, et tout le monde regarde depuis son navigateur, avec reprise de la lecture là où elle s'était arrêtée. Un administrateur peut aussi télécharger un film **autorisé** (licence libre) en pair-à-pair (BitTorrent).

Projet de groupe Holberton School : microservices Java (Spring Boot), PostgreSQL, interface React, le tout lancé par Docker Compose.

> **Droits d'auteur.** HomeFlix ne fournit aucun film. N'indexez et ne téléchargez que des contenus dont vous avez le droit (vos propres fichiers, films sous licence libre). Le P2P n'accorde **aucun droit** sur un contenu : voir [`docs/legal/`](docs/legal/).

## Sommaire

1. [Ce qu'il faut avoir](#1-ce-quil-faut-avoir)
2. [Installation](#2-installation)
3. [Première utilisation](#3-première-utilisation)
4. [Configuration](#4-configuration)
5. [Bibliothèque sur un NAS ou un disque réseau](#5-bibliothèque-sur-un-nas-ou-un-disque-réseau)
6. [Environnements testés](#6-environnements-testés)
7. [Arrêter, redémarrer, sauvegarder](#7-arrêter-redémarrer-sauvegarder)
8. [Dépannage](#8-dépannage)
9. [Pour les développeurs](#9-pour-les-développeurs)
10. [Documentation](#10-documentation)

## 1. Ce qu'il faut avoir

| Besoin | Détail |
|---|---|
| **Docker** avec **Docker Compose v2** | La commande `docker compose version` doit répondre. Testé avec Docker 29 et Compose 5 (voir [section 6](#6-environnements-testés)). |
| **Git** et **curl** | Pour récupérer le code et pour les quelques commandes de la section 3. |
| **openssl** | Utilisé par le script qui génère vos secrets (présent par défaut sous Linux et macOS). |
| **Mémoire** | La pile au repos occupe environ **1,3 Go** (mesuré). La compilation du premier démarrage en demande davantage : prévoyez **4 Go de mémoire disponibles pour Docker** (recommandation ; le pic n'a pas été mesuré). |
| **Disque** | Environ **2 Go** pour les images Docker (mesuré), plus la place de vos films. |
| **Réseau** | Internet au premier démarrage (images Docker, dépendances), puis seulement pour le P2P. |
| **Port 8080 libre** | C'est le **seul** port publié par HomeFlix (modifiable, voir [section 4](#4-configuration)). |

## 2. Installation

Cinq étapes. Toutes les commandes se lancent dans le dossier `homeflix/` du dépôt.

**1. Récupérer le code**

```bash
git clone https://github.com/tomvieilledent/holbertonschool-homeflix-project.git
cd holbertonschool-homeflix-project/homeflix
```

**2. Créer votre fichier de secrets `.env`**

```bash
./scripts/gen-secrets.sh
```

Le script crée `.env` à partir de `.env.example` et génère un secret aléatoire pour chaque variable (mots de passe des bases, clé de signature des connexions, code d'installation…). Le fichier est lisible par vous seul (droits 600), ignoré par Git, et les secrets ne sont jamais affichés. Relancer le script ne modifie jamais un `.env` existant : il ajoute seulement les variables qui manquent. **Ne committez jamais `.env` et ne l'envoyez à personne.**

**3. Indiquer où se trouvent vos films**

Ouvrez `.env` et réglez `MEDIA_DIR` sur le dossier qui contient vos films, **sur la machine qui fait tourner Docker** :

```
MEDIA_DIR=/chemin/vers/mes/films
```

Ce dossier est monté **en lecture seule** : HomeFlix ne modifie, ne déplace et ne supprime jamais vos fichiers. Le format conseillé est le **MP4 (H.264 / AAC)**, qui se lit dans tous les navigateurs. Les fichiers `.mkv` et `.webm` sont indexés, mais leur lecture dépend du navigateur.

*Pour essayer sans vos propres films :* `./scripts/fetch-demo-media.sh` télécharge dans `demo-media/` des films libres (Blender Foundation, licence CC BY 3.0) ; c'est la valeur par défaut de `MEDIA_DIR`. Le script demande `curl`, `unzip`, `ffmpeg`, `ffprobe` et `sha256sum`.

**4. Démarrer**

```bash
docker compose up --build -d --wait
```

Le premier démarrage compile les trois services et l'interface : comptez **environ 3 minutes** sur une machine récente (2 min 50 s mesurées sur GitHub Actions) ; une fois les images construites, environ une minute. La commande rend la main quand tous les services sont en bonne santé. Vérifiez :

```bash
docker compose ps
```

Chaque service doit afficher `healthy`.

**5. Ouvrir HomeFlix**

Allez sur **http://localhost:8080/setup** pour créer le premier administrateur (section 3). Attention : sans cette adresse, la page d'accueil du site affiche la **connexion**, qui ne renvoie pas vers la création du compte.

## 3. Première utilisation

### Créer l'administrateur

Ouvrez **http://localhost:8080/setup** (écran « Première configuration ») et remplissez :

| Champ | Valeur |
|---|---|
| Code d'installation | la valeur de `SETUP_TOKEN` dans `.env` (`grep '^SETUP_TOKEN=' .env`) |
| Identifiant | 3 à 40 caractères : lettres, chiffres, `.`, `-`, `_` |
| Adresse e-mail | la vôtre |
| Mot de passe | 12 à 128 caractères |

Après l'envoi, vous arrivez sur la page de connexion (« Administrateur créé. Connectez-vous pour continuer. »). Cette étape ne se fait qu'**une fois** : ensuite, l'adresse `/setup` renvoie vers la connexion.

### Déclarer votre dossier de films et lancer l'indexation

Les écrans d'administration (dossiers, indexation, comptes, profils) sont **en cours de développement**. En attendant, ces trois actions se font en ligne de commande, avec l'API que l'interface utilisera. Elles marchent telles quelles.

D'abord, obtenez un jeton de connexion (valable 15 minutes ; relancez ces deux lignes quand il expire). Évitez les guillemets `"` et les antislashs `\` dans votre mot de passe pour ces commandes :

```bash
BASE=http://localhost:8080
read -r -p "Identifiant : " ADMIN; read -r -s -p "Mot de passe : " PASS; echo
TOKEN=$(curl -s -X POST "$BASE/api/identity/v1/auth/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN\",\"password\":\"$PASS\"}" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')
[ -n "$TOKEN" ] && echo "Connecté" || echo "Échec de la connexion"
```

Ensuite, déclarez le dossier de films. Dans le conteneur, votre `MEDIA_DIR` s'appelle toujours **`/media`** :

```bash
curl -s -X POST "$BASE/api/library/v1/admin/media-roots" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"path":"/media","label":"Mes films"}'
```

La réponse contient l'identifiant du dossier (code HTTP 201). Puis lancez l'indexation et regardez son état :

```bash
curl -s -X POST "$BASE/api/library/v1/admin/index" -H "Authorization: Bearer $TOKEN"
curl -s "$BASE/api/library/v1/admin/index/status" -H "Authorization: Bearer $TOKEN"
```

L'indexation est rapide : `"state":"COMPLETED"` indique qu'elle est finie, et `"added"` donne le nombre de films ajoutés. Relancez-la chaque fois que vous ajoutez des films. Un film dont le fichier disparaît (ou dont le disque est démonté) passe à « indisponible » sans être supprimé, et revient quand le fichier revient.

### Créer un profil

Chaque personne regarde avec un **profil** (jusqu'à 5 par compte) : c'est à lui que sont rattachés la progression et la liste « Ma liste ». Créez le vôtre :

```bash
curl -s -X POST "$BASE/api/identity/v1/profiles" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"name":"Moi","avatar":"bleu"}'
```

### Ajouter un proche

L'administrateur crée un compte (rôle `USER`) ; la personne se connecte ensuite sur http://localhost:8080 et crée son profil avec la commande ci-dessus, en utilisant **son** jeton. Le mot de passe (12 caractères minimum) est saisi sans s'afficher et n'est écrit nulle part :

```bash
read -r -p "Identifiant du proche : " NEWUSER; read -r -p "Adresse e-mail : " NEWMAIL
read -r -s -p "Mot de passe (12 caractères minimum) : " NEWPASS; echo
curl -s -X POST "$BASE/api/identity/v1/admin/accounts" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$NEWUSER\",\"email\":\"$NEWMAIL\",\"password\":\"$NEWPASS\",\"role\":\"USER\"}"
```

### Regarder un film

1. Ouvrez **http://localhost:8080** et connectez-vous.
2. Choisissez votre profil (« Qui regarde ? »).
3. Ouvrez le **Catalogue** (recherche par titre, filtre par genre), choisissez un film, puis lancez la lecture.
4. Vous pouvez avancer et reculer ; la position est enregistrée et reprise à la prochaine lecture.

> **À savoir.** La page d'**Accueil** (rangées « Continuer à regarder », « Ma liste »…) est en cours de développement : elle peut afficher une erreur tant que le service Library ne fournit pas son contenu. Passez par le **Catalogue**.

### Télécharger un film autorisé en P2P (administrateur)

> **En cours de développement.** Le lancement d'un téléchargement depuis l'application n'est pas encore disponible de bout en bout (ni l'écran d'administration, ni la route qui l'orchestre).

Ce qui est déjà en place : le client BitTorrent (Transmission) tourne dans un réseau isolé et n'est **jamais** accessible depuis l'extérieur ; le catalogue des contenus téléchargeables est **fermé** (seules des entrées avec une source et une licence documentées y figurent, voir [`docs/legal/P2P_DEMO.md`](docs/legal/P2P_DEMO.md)). Les fichiers terminés arrivent dans `/downloads/complete`. Pour que Library les voie, déclarez le dossier **`/downloads`** (et non `/downloads/complete`) : même appel que pour `/media`, avec `"path":"/downloads"`.

## 4. Configuration

Tout se règle dans `.env` (modèle commenté : [`homeflix/.env.example`](homeflix/.env.example)). Après une modification, relancez `docker compose up -d`.

| Variable | Rôle | Par défaut |
|---|---|---|
| `MEDIA_DIR` | Dossier de vos films sur la machine hôte (monté en lecture seule dans `/media`) | `./demo-media` |
| `FRONTEND_PORT` | Port d'accès à HomeFlix, le seul publié | `8080` |
| `DOWNLOADS_DIR` | Dossier des téléchargements P2P : un volume Docker géré pour vous, ou un dossier de la machine | volume `downloads` |
| `PUID`, `PGID` | Utilisateur et groupe qui écrivent dans `/downloads` (sous Linux : `id -u`, `id -g`) | `1000`, `1000` |
| `COOKIE_SECURE` | Cookie de session « Secure » (HTTPS ou `http://localhost` seulement) | `true` |
| `TRANSMISSION_DHT` | Découverte de pairs sans serveur central ; à passer à `true` si le téléchargement ne démarre pas | `false` |
| `TRANSMISSION_LIMIT_UP` / `_DOWN` | Débit d'envoi et de réception maximal (ko/s, 0 = illimité) | `200` / `10000` |

Les autres variables (mots de passe des bases, clé de signature des connexions, secrets entre services, code d'installation) sont **générées** par `gen-secrets.sh` : ne les modifiez pas à la main.

## 5. Bibliothèque sur un NAS ou un disque réseau

HomeFlix lit un **dossier de la machine qui fait tourner Docker**. Pour utiliser un NAS, montez d'abord le partage sur cette machine, puis indiquez le point de montage dans `MEDIA_DIR` :

```bash
# Exemple Linux, partage SMB : lecture seule, fichiers lisibles par tous (le service Library n'est pas root)
sudo mkdir -p /mnt/nas/films
sudo mount -t cifs //nas.local/films /mnt/nas/films -o ro,guest,file_mode=0444,dir_mode=0555
# puis dans .env :
MEDIA_DIR=/mnt/nas/films
```

Points d'attention :

- **Montez le partage avant** de lancer `docker compose up`, et faites en sorte qu'il soit remonté au démarrage de la machine (`/etc/fstab`).
- **Droits de lecture** : le service Library ne s'exécute pas en root. Les fichiers doivent être lisibles par « tous » (options `file_mode` et `dir_mode` ci-dessus, ou droits adaptés côté NFS).
- Si le partage se déconnecte, les films concernés passent à « indisponible » à la prochaine indexation et reviennent une fois le partage remonté et l'indexation relancée. Aucun film n'est supprimé.
- Seuls Docker sur **Linux** et **Docker Desktop avec WSL 2** sont visés. Le comportement des droits d'un partage réseau varie selon le NAS : **cette configuration n'a pas été testée sur un vrai NAS** (voir [`docs/RISKS.md`](docs/RISKS.md), risque R4).

## 6. Environnements testés

| Environnement | État |
|---|---|
| Linux (Ubuntu, GitHub Actions `ubuntu-latest`) | Pile complète et suite de tests à **chaque** modification, y compris un redémarrage des conteneurs avec vérification des données |
| Linux sous WSL 2, Docker 29.9, Compose 5.7 | Poste de développement : installation, parcours complet, sauvegarde et restauration |
| Navigateurs | Lecture vérifiée dans **Chrome** et **Firefox** (captures dans [`docs/legal/evidence/`](docs/legal/evidence/)) |
| macOS, Windows sans WSL 2, ARM (Raspberry Pi) | **Non testés** |
| NAS réel (SMB, NFS) | **Non testé** (voir section 5) |
| HTTPS derrière un proxy externe | **Non testé** : HomeFlix sert du HTTP simple sur le port 8080 |

## 7. Arrêter, redémarrer, sauvegarder

Depuis `homeflix/` :

```bash
docker compose stop            # arrête sans rien supprimer
docker compose start           # relance
docker compose down            # supprime les conteneurs, GARDE vos données
docker compose down -v         # supprime AUSSI les données (comptes, catalogue, progression) : remise à zéro
```

Vos comptes, profils, favoris et progressions sont conservés dans un volume Docker : ils survivent à un redémarrage et à `down` (c'est vérifié automatiquement par `./scripts/test-persistence.sh`).

**Remettre la démonstration à zéro** (efface TOUT, puis recrée des comptes de démonstration, leurs profils et le catalogue) : `./scripts/reset-demo.sh`. À réserver à une démonstration, jamais à une vraie installation. Procédure, comptes et mot de passe : [`docs/DEMO.md`](docs/DEMO.md).

**Sauvegarde et restauration** des données (les trois bases, via `pg_dump`) :

```bash
./scripts/backup.sh                                  # crée backups/homeflix-backup-AAAAMMJJ-HHMMSS.tar.gz
./scripts/restore.sh backups/homeflix-backup-….tar.gz   # demande de taper RESTAURER avant d'écraser quoi que ce soit
```

L'archive **ne contient ni vos films, ni les fichiers téléchargés, ni le fichier `.env`**. Elle contient des **données personnelles** (comptes, mots de passe hachés, historique de visionnage) : droits 600, ne la partagez pas. Détails dans l'en-tête de [`backup.sh`](homeflix/scripts/backup.sh) et [`restore.sh`](homeflix/scripts/restore.sh).

## 8. Dépannage

Commencez toujours par `docker compose ps` (état des services) puis `docker compose logs <service>` (par exemple `identity-service`, `library-service`, `acquisition-service`, `frontend`, `transmission`, `db`).

| Symptôme | Cause probable | Solution |
|---|---|---|
| `port is already allocated` ou la page ne répond pas | Le port 8080 est déjà pris | Mettez `FRONTEND_PORT=8081` dans `.env`, puis `docker compose up -d` et ouvrez `http://localhost:8081` |
| Le premier démarrage est très long ou un service est `unhealthy` | Compilation en cours, ou mémoire insuffisante | Patientez jusqu'à une dizaine de minutes la première fois ; sinon lisez `docker compose logs <service>` |
| Un conteneur s'arrête seul (code 137, `Killed`) | Manque de mémoire | Libérez de la mémoire ou, sous Docker Desktop, augmentez-la dans les réglages (au moins 4 Go) |
| Erreur d'authentification de PostgreSQL après avoir régénéré `.env` | Les mots de passe sont lus seulement à la création du volume | `docker compose down -v` (efface les données), puis relancez |
| Aucun film après l'indexation | Dossier non déclaré, mauvais chemin, ou extension non reconnue (`.mp4`, `.mkv`, `.webm`) | Vérifiez `MEDIA_DIR` et la déclaration de `/media` ; lisez `"errors"` dans l'état de l'indexation |
| Un film est « indisponible » | Fichier absent, droits insuffisants ou partage démonté | Rétablissez le fichier ou le montage, puis relancez l'indexation |
| La vidéo ne démarre pas | Format non pris en charge par votre navigateur (souvent `.mkv`) | Utilisez un MP4 H.264/AAC |
| `429` « Trop de tentatives » à la connexion | Cinq mauvais mots de passe de suite verrouillent l'identifiant pendant 5 minutes | Patientez 5 minutes, ou `docker compose restart identity-service` (le compteur est en mémoire) |
| Déconnecté à chaque rechargement en HTTP depuis un autre appareil | Le cookie de session est « Secure » et le navigateur le refuse hors HTTPS | Sur un réseau de confiance : `COOKIE_SECURE=false` dans `.env`, puis `docker compose up -d` |
| Droits refusés sur `/downloads` | `PUID` et `PGID` ne correspondent pas au propriétaire du dossier | Ajustez `PUID`/`PGID` (`id -u`, `id -g`) ou changez le propriétaire du dossier |
| Un appel de téléchargement répond `409` « dossier non déclaré » | `/downloads` n'est pas déclaré comme dossier dans Library | Déclarez `/downloads` (section 3) |
| Un téléchargement P2P ne démarre jamais | Aucun pair disponible, ou le réseau bloque BitTorrent | Mettez `TRANSMISSION_DHT=true` dans `.env` et relancez ; sinon essayez un autre réseau |

Pour **tout remettre à zéro** : `docker compose down -v`, puis `docker compose up --build -d --wait`.

## 9. Pour les développeurs

- **Architecture :** trois services Spring Boot 4 / Java 21 (`identity-service`, `library-service`, `acquisition-service`), une base PostgreSQL par service, un frontend React 19 / Vite servi par nginx, qui fait aussi le reverse proxy. Voir [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
- **Surcouche de développement** (ports des services et de la base publiés sur `127.0.0.1` seulement) :

  ```bash
  docker compose -f compose.yaml -f compose.dev.yaml up --build
  ```

- **Tests :** `./mvnw test` dans chaque service (Docker est requis pour Testcontainers) ; `npm test` dans `homeflix/frontend` (voir son [README](homeflix/frontend/README.md)).
- **Scripts** (dans `homeflix/scripts/`) : `smoke.sh` (test de fumée de la pile complète), `test-persistence.sh` (les données survivent au redémarrage), `test-backup-restore.sh` (une sauvegarde se restaure), `check-security-headers.sh` (en-têtes du proxy), `check-secrets.sh`.
- **Conventions :** commits [Conventional Commits](https://www.conventionalcommits.org/) (`feat(identity): …`), une issue = une branche = une PR vers `main`. Détails dans [`CONTRIBUTING.md`](CONTRIBUTING.md) et [`docs/WORKING_AGREEMENT.md`](docs/WORKING_AGREEMENT.md).

## 10. Documentation

| Document | Contenu |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Services, réseau, données, diagrammes |
| [`docs/adr/`](docs/adr/) | Décisions d'architecture (authentification et sécurité, infrastructure) |
| [`docs/api/`](docs/api/) | Contrats OpenAPI des services et conventions d'erreur |
| [`docs/RISKS.md`](docs/RISKS.md) | Registre des risques |
| [`docs/legal/`](docs/legal/) | Licences des films de démonstration et du fichier P2P |
| [`docs/AI_AGENT_ROLE.md`](docs/AI_AGENT_ROLE.md) | Rôle de l'agent IA relecteur |
| [`docs/DEMO.md`](docs/DEMO.md) | Environnement de démonstration : remise à zéro, comptes de démonstration |
