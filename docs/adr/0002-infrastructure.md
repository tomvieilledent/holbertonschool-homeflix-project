# ADR 0002 — Architecture d'infrastructure

- **Statut** : proposé (à valider par l'équipe, voir la PR)
- **Date** : 2026-11-16
- **Décideurs** : Tom, Jason, Haitu
- **Issue** : #1

## Contexte

HomeFlix doit démarrer avec `docker compose up --build` sur la machine d'une personne extérieure à l'équipe. Il faut figer très tôt l'infrastructure (réseau, ports, bases, client BitTorrent, versions) pour que Tom (services), Jason (frontend) et Haitu (infra) travaillent sur la même base.

Contraintes du sujet : un conteneur par service métier, une base (ou un schéma) par service, médias source montés en lecture seule, dossier de téléchargements séparé, interface d'administration du client BitTorrent inaccessible aux utilisateurs, aucun secret dans le dépôt, healthchecks, volumes persistants.

## État existant (audit du 16/11)

| Élément | État |
|---|---|
| Services Spring Boot (identity, library, acquisition) | Spring Boot 4.1.2, Java 21 ; squelettes (classe principale + test `contextLoads`), Dockerfile multi-stage présent |
| Frontend | React 19 + Vite, JavaScript ; architecture posée par la PR #135 ; Dockerfile multi-stage (Node 24 → nginx 1.27) |
| `homeflix/compose.yaml` | Présent : db, 3 services, transmission, frontend ; réseaux `internal` et `torrent` ; volumes `pgdata`, `downloads`, `transmission-config` |
| `homeflix/.env.example` | Présent, valeurs `CHANGE_ME` ; `scripts/gen-secrets.sh` génère un `.env` aléatoire |
| `homeflix/initdb/01-create-databases.sh` | Crée un rôle et une base par service, `REVOKE CONNECT … FROM PUBLIC` |
| `homeflix/frontend/nginx.conf` | Reverse proxy déjà écrit (préfixe retiré, `/internal` et `/actuator` en 404) |
| CI, tests, client BitTorrent opérationnel | Inexistants à ce jour (issues #29, #74, #61) |
| Poste de développement audité | JDK 21.0.13, Docker 29.9.3, Compose v5.7.1, Node 20.20.2 |

Écarts constatés pendant l'audit (à traiter par les issues indiquées) :

- Node 20.20.2 en local alors que l'image de build utilise Node 24 : les versions doivent être alignées, voir décision 8 (#13).
- _Résolu par #61 :_ l'image de Transmission est épinglée (`4.1.4-r0-ls369`).
- Les healthchecks des services Java testent seulement l'ouverture du port TCP, en attendant que `/actuator/health` soit ouvert par la configuration Security (#16, #81).
- Le fichier `.env.example` ne contient pas encore tous les secrets prévus par l'ADR 0001 (clé de signature RSA, clé de ticket de streaming) (#28).

## Décisions

### 1. Reverse proxy : nginx dans l'image frontend, pas de gateway Java

- nginx sert les fichiers statiques du frontend **et** proxifie `/api/identity/`, `/api/library/` et `/api/acquisition/` vers les trois services. C'est le seul conteneur dont un port est publié sur l'hôte (`FRONTEND_PORT`, 8080 par défaut).
- Le préfixe de service est retiré : `/api/identity/v1/x` devient `identity-service:8081/api/v1/x` (voir `docs/api/CONVENTIONS.md`).
- `/api/*/internal` et `/api/*/actuator` répondent 404 et ne sont jamais routés (ADR 0001, décision 6).
- Le proxy ne bufferise pas les réponses de Library (`proxy_buffering off`) pour laisser passer le streaming et les requêtes Range.
- La validation du JWT reste dans chaque service (resource server), pas dans le proxy.

### 2. Réseau Docker : un réseau interne, un seul port publié

- Tous les conteneurs sont sur le réseau `internal`. Ils se joignent par nom de service (`db`, `identity-service`, …).
- Aucun port de service, de base de données ou de Transmission n'est publié sur l'hôte (pas de section `ports:` hors frontend).

### 3. Ports

| Composant | Port conteneur | Publié sur l'hôte |
|---|---|---|
| frontend (nginx) | 80 | oui, `${FRONTEND_PORT:-8080}` |
| identity-service | 8081 | non |
| library-service | 8082 | non |
| acquisition-service | 8083 | non |
| PostgreSQL | 5432 | non |
| Transmission (RPC/Web) | 9091 | non |
| Transmission (échange de pairs) | 51413 | non (voir décision 6) |

Pour déboguer en développement, un développeur peut utiliser un fichier `compose.override.yaml` local, non versionné, qui publie temporairement un port.

### 4. PostgreSQL 17, une base et un rôle par service

- Image `postgres:17-alpine` ; un seul serveur, trois bases (`identity`, `library`, `acquisition`), chacune avec son rôle propre dont le mot de passe vient de `.env`.
- `REVOKE CONNECT ON DATABASE … FROM PUBLIC` empêche un service de se connecter à la base d'un autre : la règle « aucun accès croisé » est appliquée par la base, pas seulement par convention.
- Les schémas sont gérés par Flyway, au démarrage de chaque service, avec `ddl-auto` en `validate`.
- Les scripts de `initdb/` ne s'exécutent qu'à l'initialisation d'un volume vide. Un changement de mot de passe sur un volume existant demande de recréer le volume (documenté dans le guide de dépannage).

### 5. Médias et téléchargements : deux volumes distincts

| Chemin | Contenu | Library | Acquisition | Transmission |
|---|---|---|---|---|
| `/media` | Bibliothèque de l'utilisateur (`MEDIA_DIR`, bind mount) | lecture seule | non monté | non monté |
| `/downloads` | Fichiers téléchargés (volume nommé `downloads` par défaut, ou dossier de l'hôte via `DOWNLOADS_DIR`) | lecture seule | lecture/écriture | lecture/écriture |

- Library ne peut donc pas modifier ni effacer les médias source, ni les téléchargements.
- Un fichier terminé est découvert par Library via `/downloads`, qui est une racine autorisée distincte de `/media`. Acquisition notifie Library par un appel interne ; Library indexe sans copier.
- Les conteneurs Spring s'exécutent avec un utilisateur non root (déjà le cas dans les Dockerfiles).
- Les droits de `/downloads` (UID/GID) sont alignés : Transmission (`PUID`/`PGID`) et le conteneur Acquisition (`user: PUID:PGID`) utilisent le même UID/GID (1000 par défaut). Sans cela, Acquisition (utilisateur système `app`, UID 999) ne pourrait pas supprimer les fichiers que Transmission écrit en UID 1000. Library, en lecture seule, lit grâce aux droits « autres » (umask 022 de Transmission). Vérifié par `scripts/smoke.sh` (#42) ; à revérifier sur un environnement vierge (#90).

### 6. Client BitTorrent : Transmission, piloté en RPC, isolé

- **Choix : Transmission** (image `lscr.io/linuxserver/transmission`, **épinglée sur `4.1.4-r0-ls369`** ; empreinte testée `sha256:aaf349cd…1a85`), piloté par son API RPC depuis `acquisition-service` uniquement.
- Aucune interface web ni port RPC n'est publié. Les utilisateurs ordinaires n'ont aucune route vers lui : ni port sur l'hôte, ni route nginx. Le RPC est protégé par un identifiant et un mot de passe (`TRANSMISSION_USER`/`TRANSMISSION_PASS`).
- **Réseau dédié `torrent`** : Transmission n'est **que** sur ce réseau, avec Acquisition (qui est aussi sur `internal` pour sa base et Identity). Library, Identity, le frontend et la base ne peuvent donc ni le joindre ni même résoudre son nom ; seule Acquisition l'atteint. Ce réseau n'est pas `internal: true` : Transmission doit joindre ses pairs sur Internet. Vérifié par `scripts/smoke.sh`, et prouvé en rattachant volontairement Transmission à `internal` (Library l'atteint alors : le contrôle devient rouge).
- **La liste d'hôtes du RPC (`rpc-host-whitelist`) n'est pas utilisée** : testée sur cette version, elle n'est pas appliquée (une requête avec `Host: evil.example` obtient un 200). Ne pas s'y fier ; la protection repose sur l'isolation réseau et l'authentification.
- Acquisition n'accepte que des identifiants d'entrées du catalogue autorisé, jamais une URL ou un lien magnet fournis par l'utilisateur (voir l'issue #79 pour la protection SSRF).
- **Réseau pair-à-pair** : par défaut, seul le trafic sortant est autorisé (le port de pairs 51413 n'est pas publié). Un téléchargement fonctionne avec des connexions sortantes (trackers, pairs joignables) mais peut être plus lent. Le port de pairs est fixé à **51413** (`PEERPORT`) pour rester documenté même s'il n'est pas publié. La publication du port 51413 est une option documentée, pas un prérequis.
- **Partage** : un client BitTorrent partage les morceaux qu'il a déjà. Comme seuls des contenus à redistribution autorisée sont téléchargeables (voir #46), ce partage est licite, mais on limite quand même la durée : **arrêt du partage dès que le fichier est complet** (`ratio-limit` à 0, état « Finished », vérifié) et débit d'envoi plafonné à 200 ko/s pendant le téléchargement.
- **Découverte de pairs** : **DHT et PEX désactivés par défaut** (issue #61 : « si non nécessaire »). Mesure du 2026-11-17 avec Sintel : 38 s sans, 45 s avec (les trackers suffisent). **Plan B** si aucun tracker ne répond : `TRANSMISSION_DHT=true` et `TRANSMISSION_PEX=true` dans `.env`. Les téléchargements de test sont plafonnés à 10 000 ko/s en réception.
- **Réglages appliqués à chaque démarrage** par `homeflix/transmission/init-settings.sh` (monté dans `/custom-cont-init.d`) : Transmission réécrit `settings.json` à l'arrêt, donc on le corrige avec `jq` plutôt que de le monter. Scripts « torrent terminé », dossier surveillé et redirection de port (UPnP) désactivés.
- **Dossier des fichiers terminés : `/downloads/complete`** (les partiels sont dans `/downloads/incomplete`, suffixe `.part`). C'est ce dossier qu'il faut déclarer comme racine dans Library : les fichiers incomplets n'apparaissent jamais dans le catalogue.

### 7. Healthchecks et démarrage ordonné

- `db` : `pg_isready`. Les services dépendent de `db` avec `condition: service_healthy`.
- Services Java : test TCP sur leur port en attendant que `/actuator/health` soit exposé par la configuration Security (#16) ; il sera ensuite remplacé par un test HTTP sur `/actuator/health`.
- Library et Acquisition démarrent après Identity (JWKS joignable). Le frontend démarre après les trois services.
- `restart: unless-stopped` sur tous les services.
- **Délais et reprises, écart assumé avec l'ADR 0001** : la lecture du JWKS d'Identity par Library et Acquisition a un délai de 3 s (`identity.jwks-timeout`), mais **sans nouvelle tentative** : le décodeur de jetons n'en fait pas et un second essai doublerait l'attente (6 s) pour un service que le démarrage ordonné garantit déjà joignable. À ajouter seulement si une panne réelle le justifie. Quand Identity est injoignable, les services répondent aujourd'hui 401 `SESSION_EXPIRED`, alors que l'ADR 0001 prévoit un 503 `problem+json` : suivi dans l'issue #187.

### 8. Versions

| Composant | Version | Remarque |
|---|---|---|
| Java | 21 (Temurin) | LTS, image `eclipse-temurin:21-jdk` pour le build et `:21-jre` pour l'exécution |
| Spring Boot | 4.1.2 | Version récente : documentation à croiser avec la référence officielle |
| PostgreSQL | 17 (`alpine`) | |
| Node (build du frontend) | 24 (image Docker) | Node 20 local suffit pour les outils de dev ; la version de référence est celle de l'image |
| nginx | 1.27 (`alpine`) | |
| Transmission | `4.1.4-r0-ls369` (linuxserver) | Épinglé (#61) ; mise à jour volontaire, jamais `latest` |
| Docker / Compose | Docker ≥ 29, Compose ≥ v5 (testés) | Versions minimales à confirmer lors de la recette (#112) |

### 9. Configuration et secrets

- Un seul fichier `.env` à la racine de `homeflix/`, ignoré par Git ; `.env.example` ne contient que des `CHANGE_ME`. `scripts/gen-secrets.sh` génère des secrets aléatoires (mots de passe, clé interne, clé JWT RSA, jeton de setup, secret des tickets de streaming), crée `.env` avec les droits 600 ou complète un `.env` existant **sans jamais modifier ses valeurs**. `scripts/check-secrets.sh` vérifie qu'aucun secret n'est suivi par Git (rejouable en CI).
- Les variables `${VAR:?}` de `compose.yaml` font échouer `docker compose up` avec un message clair si un secret est absent.
- Clés de signature RSA et de ticket de streaming (ADR 0001) : fournies par variable d'environnement ou volume, jamais committées (#28).

### 10. Persistance

- Volumes nommés : `pgdata` (bases), `downloads` (fichiers téléchargés), `transmission-config` (état du client).
- `docker compose down` conserve les données ; `docker compose down -v` les supprime : l'avertissement figure dans le README et le guide de sauvegarde.
- **Sauvegarde et restauration** (issue #75) : `homeflix/scripts/backup.sh`, `restore.sh` et le test `test-backup-restore.sh`.
  - **Export logique (`pg_dump`) plutôt que copie du volume** : un export est cohérent même base en marche, portable d'une machine ou d'une version mineure de PostgreSQL à l'autre, et on peut l'inspecter. Copier à chaud le dossier d'un volume PostgreSQL risque de produire une copie corrompue.
  - **Contenu de l'archive** : les 3 bases (comptes, catalogue, progression, favoris, téléchargements), un manifeste (date, lignes par table) et des sommes SHA-256, dans `homeflix-backup-AAAAMMJJ-HHMMSS.tar.gz` (droits 600, dossier `backups/` en 700, ignoré par Git).
  - **Ce qui n'est pas sauvegardé, volontairement** : les médias (la bibliothèque de l'utilisateur, montée en lecture seule), les fichiers téléchargés (re-téléchargeables depuis le catalogue), l'état de Transmission, et le fichier `.env` : une nouvelle pile génère ses propres secrets, donc l'archive ne contient aucun secret. Conséquence : les sessions en cours sont invalidées si la clé JWT change, les utilisateurs se reconnectent.
  - **Restauration** : refusée sans confirmation explicite (taper `RESTAURER`, ou `--yes`) ; l'archive est vérifiée (SHA-256) avant toute modification ; l'état actuel est sauvegardé (`pre-restore-…`) avant d'être remplacé ; fonctionne sur une pile vierge (la base est démarrée si besoin) ; le nombre de lignes de chaque table est contrôlé après coup. Une restauration vers une version plus ancienne du code est refusée par Flyway (schéma plus récent que le code).
  - **Les archives contiennent des données personnelles** (mots de passe hachés, historique de visionnage) : à garder hors du dépôt et hors de portée des autres utilisateurs. Le guide utilisateur complet est l'issue #100 ; l'automatisation de la vérification du redémarrage est l'issue #89.

### 11. En-têtes de sécurité du proxy, CSP et exposition sur Internet

**Ce que le proxy envoie** (`homeflix/frontend/nginx.conf`, sur toutes les réponses, y compris les erreurs : `always`) :

| En-tête | Valeur | Rôle |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self' data:; media-src 'self'; connect-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` | Réduit l'XSS : seuls les fichiers de l'application s'exécutent, aucun script ni style en ligne, aucune ressource externe ; `frame-ancestors 'none'` empêche l'affichage dans un cadre (clickjacking) |
| `X-Content-Type-Options` | `nosniff` | Le navigateur ne devine pas le type des fichiers |
| `X-Frame-Options` | `DENY` | Équivalent de `frame-ancestors` pour les vieux navigateurs |
| `Referrer-Policy` | `same-origin` | Aucune adresse n'est envoyée à un autre site |
| `Permissions-Policy` | caméra, micro, géolocalisation, paiement, USB désactivés | Aucune fonction sensible du navigateur n'est utilisée |
| `Cross-Origin-Opener-Policy` / `Cross-Origin-Resource-Policy` | `same-origin` | Isole la page des autres origines |

- **Pourquoi une CSP aussi stricte est possible** : le build du frontend n'a aucun code ni style en ligne, aucune ressource externe (polices servies en local), et tout est sur **la même origine** que l'API. `data:` n'est autorisé que pour les images et polices, car le build intègre une petite police dans le CSS.
- **Lecteur vidéo** : `media-src 'self'` suffit, car l'URL du flux est relative (`/api/library/v1/stream/{id}?t=…`, voir le contrat). Si un jour le lecteur utilise des `blob:` (MediaSource), il faudra ajouter `blob:` à `media-src`.
- **Pas de CORS** : l'interface et l'API partagent la même origine, donc aucun en-tête `Access-Control-Allow-*` n'est envoyé. Une origine étrangère reste rejetée par les services (403 « Invalid CORS request »).
- **`Host $http_host` et non `$host`** : `$host` perd le port. Or le navigateur ajoute `Origin: http://localhost:8080` à tout `POST`, `PUT` ou `DELETE`, et Spring le compare à `Host`. Sans le port, une requête de la **même** origine était prise pour du CORS étranger et rejetée en 403 : la connexion aurait échoué. Défaut détecté par le test navigateur de #54.
- **Routes jamais exposées** : `/api/<service>/internal…` et `/api/<service>/actuator…` (avec ou sans `/v1`, sans tenir compte de la casse), ainsi que `/internal` et `/actuator` à la racine, répondent 404 (ADR 0001 : `/internal/**` n'est jamais routé). `/actuator/health` reste joignable **entre conteneurs** (healthchecks), jamais par le proxy. Les variantes encodées (`%69nternal`), à double barre, avec point-virgule ou avec `./` sont aussi refusées.
- **Taille des requêtes** : `client_max_body_size 1m` (l'application n'envoie que du JSON court) ; au-delà, 413. `server_tokens off` masque la version de nginx.
- **Vérification** : `homeflix/scripts/check-security-headers.sh` (la pile doit tourner) contrôle tout cela avec `curl` : 68 vérifications, dont la preuve qu'elles **échouent** sur l'ancienne configuration.

**Exigences HTTPS pour une exposition sur Internet** (hors périmètre du projet, qui vise un réseau domestique ; à respecter avant d'ouvrir HomeFlix à Internet) :
1. **Terminer TLS devant nginx** (Caddy, Traefik ou nginx avec des certificats Let's Encrypt renouvelés automatiquement). Ne jamais publier le port 8080 tel quel sur Internet : il parle HTTP en clair.
2. **Rediriger HTTP vers HTTPS** (80 vers 443) et ajouter **`Strict-Transport-Security`** (`max-age=31536000; includeSubDomains`) **seulement une fois HTTPS stable** : un navigateur qui l'a reçu refuse ensuite tout retour en HTTP.
3. **Ajouter `upgrade-insecure-requests`** à la CSP.
4. **Le cookie `refresh_token` doit rester `Secure`** (ADR 0001). Piège à connaître dès maintenant : un navigateur ne conserve pas un cookie `Secure` reçu en **HTTP** sur une autre adresse que `localhost` (par exemple `http://192.168.1.20:8080`). Sur un réseau local en HTTP, la session ne survivrait donc pas à un rechargement de page : soit utiliser HTTPS (même avec un certificat auto-signé de confiance), soit désactiver `Secure` **uniquement en développement** (profil `dev`).
5. **Transmettre `X-Forwarded-Proto`** (déjà fait par nginx) pour que les services sachent que la requête d'origine est en HTTPS.
6. **Limiter le débit de la connexion** au niveau du proxy (`limit_req`) et garder les autres ports fermés (pare-feu de l'hôte).
7. Le jeton de **première configuration** (`SETUP_TOKEN`) doit être fort et la page de setup n'est utilisable qu'une fois ; vérifier qu'aucun administrateur n'a été créé par un tiers avant d'ouvrir l'accès.

## Conséquences

- Une seule URL publique à protéger et à documenter ; les services ne sont jamais exposés directement.
- L'isolation des données est garantie par les rôles PostgreSQL, indépendamment du code Java.
- La CI (#29) et l'installation propre sur machine vierge (#112) testent la même `compose.yaml` que les développeurs.
- Library et Acquisition fonctionnent sur des racines de fichiers distinctes, ce qui rend la remise d'un fichier téléchargé explicite et testable.

## Alternatives écartées

| Décision | Alternative écartée | Raison du rejet |
|---|---|---|
| Reverse proxy | Gateway Spring Cloud | Un composant Java de plus à construire, tester et justifier pour un besoin que nginx couvre ; le sujet ne la compte pas dans les 3 services |
| Reverse proxy | Traefik | Plus de configuration dynamique que nécessaire ; nginx est déjà dans l'image frontend |
| Réseau | Publier chaque service sur l'hôte | Élargit la surface d'attaque ; contourne la validation du proxy |
| Bases | Un seul schéma partagé | Viole la règle « chaque service possède ses données » |
| Bases | Un serveur PostgreSQL par service | Trois conteneurs de base pour un MVP ; la séparation par rôle et par base suffit |
| Client P2P | qBittorrent | Interface web plus lourde ; RPC de Transmission plus simple à intégrer et à documenter |
| Client P2P | Moteur BitTorrent codé dans l'équipe | Hors périmètre du sujet |
| Médias | Volume en lecture/écriture pour Library | Library n'a aucune raison de modifier les médias source |
| Téléchargements | Copier les fichiers vers `/media` | Écriture dans la bibliothèque de l'utilisateur ; duplication ; racine autorisée séparée plus simple à contrôler |
| Secrets | Fichier de secrets Docker (`secrets:`) | Mieux isolé, mais ajoute de la complexité à l'installation ; `.env` ignoré par Git suffit pour le MVP, à documenter comme limite |
| Healthcheck | `curl` dans l'image JRE | Ajoute un binaire à l'image ; test TCP puis `/actuator/health` via un test Java ou `wget` |

## Points ouverts

1. ~~Version exacte de Transmission et ses réglages de partage~~ : fait dans #61.
2. **Healthcheck HTTP** `/actuator/health` à la place du test TCP, quand la configuration Security de Tom (#16) est livrée.
3. **Publication du port de pairs 51413** : le téléchargement sortant seul a abouti en 38 à 45 s (test #61), donc **non publié**. À réévaluer seulement si le test sur le réseau de la soutenance (#111, #125) est trop lent.
4. **Environnements supportés** : seuls Docker Engine sur Linux et Docker Desktop (Windows via WSL2) sont à tester ; NAS et partages SMB/NFS à documenter comme prérequis, sans garantie (#112, #116).
