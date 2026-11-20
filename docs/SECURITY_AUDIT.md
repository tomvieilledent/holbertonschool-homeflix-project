# Audit de sécurité : montages, permissions, réseau et images

Audit réalisé le 2026-11-20 sur la branche `main` (commit `200807a`), avec une pile démarrée par `docker compose` sur une machine de développement. Il vérifie les montages en lecture seule, les utilisateurs non root, les ports exposés, l'isolation réseau de Transmission, l'absence de secrets, et passe Trivy sur les images et les dépendances.

Les contrôles sont rejouables : `homeflix/scripts/security-audit.sh` (checklist, lancée par la CI) et `homeflix/scripts/security-audit.sh --trivy` (avec Trivy, à la main). Les vulnérabilités connues changent chaque jour : les chiffres de Trivy ci-dessous valent pour le 2026-11-20.

## Résultat en bref

| Critère de l'issue #90 | Résultat |
|---|---|
| Aucune vulnérabilité critique non justifiée | **Atteint** : 3 images corrigées (0 critique, 0 haute), 1 critique acceptée et justifiée (PostgreSQL, voir E4) |
| Le rapport liste constats et corrections | Ce document : 8 écarts, 3 corrigés, 5 documentés avec leur raison |
| Trivy + checklist | Trivy 0.65.0 sur les 6 images, les dépendances et les Dockerfiles ; checklist de 42 contrôles automatisés |

## Checklist

Tous les contrôles sont conformes après correction (`security-audit.sh`, 42 contrôles).

| Domaine | Contrôle | Résultat |
|---|---|---|
| Montages | Library lit `/media` et `/downloads` en lecture seule ; scripts d'initialisation de la base et de Transmission en lecture seule | Conforme. Acquisition et Transmission écrivent dans `/downloads` (c'est leur rôle) ; ni l'un ni l'autre n'a `/media` |
| Montages | Aucun `docker.sock` monté, aucun conteneur privilégié, en réseau `host` ou dans l'espace de processus de l'hôte | Conforme |
| Utilisateurs | Processus principal non root pour la base (UID 70), Identity et Library (999), Acquisition (1000), frontend (101) | Conforme |
| Utilisateurs | Transmission | Le démon tourne sous `abc` (UID 1000) ; l'init de l'image démarre en root (voir E5) |
| Ports | Un seul port publié sur l'hôte : le frontend | Conforme (aussi vérifié par `smoke.sh`) |
| Réseaux | Transmission seul sur le réseau `torrent`, avec Acquisition ; base, Identity, Library et frontend n'y sont pas | Conforme (accès réseau refusé aussi vérifié par `smoke.sh`) |
| Secrets | Chaque conteneur ne reçoit que ses variables : par exemple la clé privée JWT seulement Identity, le secret des tickets seulement Library, le mot de passe de Transmission seulement Acquisition et Transmission, aucun secret pour le frontend | Conforme |
| Secrets | Aucune variable secrète dans les images ; aucun secret dans les fichiers suivis (gitleaks et `check-secrets.sh` en CI, Trivy `secret`) | Conforme |
| Durcissement | Identity, Library, Acquisition et frontend : toutes les capacités Linux retirées, `no-new-privileges`, système de fichiers en lecture seule | Conforme après correction (E3) |

## Trivy

Vulnérabilités critiques et hautes par image, avant et après les corrections de cet audit.

| Image | Avant | Après |
|---|---|---|
| Identity | 2 critiques, 2 hautes (BouncyCastle 1.80) | 0, 0 |
| Library | 0, 0 | 0, 0 |
| Acquisition | 0, 0 | 0, 0 |
| Frontend (nginx) | 3 critiques, 65 hautes (nginx 1.27, Alpine 3.21.3) | 0, 0 |
| PostgreSQL 17 (Alpine) | 1 critique, 47 hautes | 1 critique (justifiée), 25 hautes |
| Transmission | 0, 0 | 0, 0 |

Dépendances (`pom.xml`, `package-lock.json`) : aucune vulnérabilité critique après la correction d'Identity. Dockerfiles (`trivy config`) : aucune mauvaise configuration.

Pour PostgreSQL, l'image locale est passée d'Alpine 3.24.2 à 3.24.4 entre deux analyses du même jour : la première listait aussi des paquets Alpine (`krb5-libs`, etc.) corrigés depuis. Les 26 constats restants sont tous dans le binaire `gosu`, plus précisément dans la bibliothèque standard Go v1.24.6 qu'il embarque.

Limite de l'outil : sur un `pom.xml`, Trivy ne résout pas les versions gérées par le parent Spring Boot (il le signale : « Dependency version cannot be determined »). Ce sont donc les analyses d'images, qui lisent les bibliothèques réellement présentes dans le jar, qui font foi pour les services Java.

## Écarts et traitement

| # | Constat | Décision |
|---|---|---|
| E1 | **BouncyCastle 1.80 dans Identity** : 2 vulnérabilités critiques, 2 hautes, 1 moyenne. La bibliothèque ne sert qu'à hacher les mots de passe (Argon2), donc les failles décrites (GOST, LDAP, contraintes de noms) ne sont probablement pas atteignables. | **Corrigé** : passage à 1.85.2. Preuve de compatibilité : un mot de passe haché avec la version 1.80 se vérifie avec la 1.85.2 (connexion 200, mauvais mot de passe 401), donc les comptes existants survivent à la mise à jour. |
| E2 | **Image du frontend** (nginx 1.27 sur Alpine 3.21.3) : 3 critiques, 65 hautes. | **Corrigé** : nginx 1.31 (1.30 contenait encore 4 failles critiques de nginx) et `apk upgrade` à la construction pour les paquets Alpine publiés depuis l'image de base. Le conteneur reste sans privilèges (UID 101). |
| E3 | **Aucun durcissement système** : capacités Linux complètes, élévation de privilèges possible, système de fichiers inscriptible. | **Corrigé** sur Identity, Library, Acquisition et frontend (`compose.yaml`, ancre `x-hardening`) : `cap_drop: ALL`, `no-new-privileges`, `read_only` avec `/tmp` en mémoire. Vérifié : capacités effectives à 0, écriture refusée hors `/tmp`, test de fumée 50/50, parcours complet (compte, indexation, lecture par plages d'octets, progression) sans erreur. |
| E4 | **PostgreSQL : 1 vulnérabilité critique** (CVE-2025-68121, `gosu`) et 25 hautes, toutes dans la bibliothèque Go du binaire `gosu`. Pas de correctif dans l'image publiée (la plus récente date du 2026-11-18). | **Documenté, justifié** dans `homeflix/.trivyignore` : `gosu` ne sert qu'à abandonner les privilèges au démarrage du conteneur et n'ouvre aucune connexion réseau ; la base n'est publiée sur aucun port et n'est joignable que depuis le réseau interne. À réexaminer à chaque nouvelle image PostgreSQL 17. |
| E5 | **Transmission démarre en root** (image LinuxServer : l'init applique `PUID`/`PGID` puis abandonne les privilèges) ; le démon, lui, tourne sous un utilisateur normal. Le durcissement des capacités casserait cette phase d'initialisation. | **Documenté, non corrigé**. Mesures compensatoires : réseau isolé (seul Acquisition l'atteint), port du RPC non publié, authentification obligatoire, aucun accès à `/media`, écriture limitée à `/downloads` et à sa configuration. PostgreSQL est exclu du durcissement pour la même raison (démarrage en root). |
| E6 | **Le frontend écoute sur toutes les interfaces** de l'hôte (`0.0.0.0:8080`). | **Documenté, voulu** : HomeFlix doit être joignable depuis le réseau local. Sans HTTPS, ne pas l'exposer à Internet. Pour un usage sur une seule machine, lier le port à `127.0.0.1` dans `compose.yaml`. |
| E7 | **Aucune limite de ressources** (mémoire, processeur, nombre de processus). Un service fautif peut saturer la machine hôte. | **Documenté, non corrigé** : les bonnes valeurs dépendent de la machine (mesure : environ 1,3 Go de mémoire au repos pour la pile). À fixer lors du déploiement, avec `mem_limit` et `pids_limit`. |
| E8 | **Images de base non figées par empreinte** : `eclipse-temurin:21`, `node:24-alpine`, `postgres:17-alpine`. Seule Transmission est épinglée sur une version précise. Une reconstruction peut donc embarquer une version différente. | **Documenté** : accepté pour une démonstration (on profite des correctifs de sécurité) ; pour la production, épingler par empreinte et rejouer `security-audit.sh --trivy` à chaque mise à jour. |
| E9 | **Trivy n'est pas lancé par la CI** : ses résultats changent chaque jour, une PR sans rapport avec la sécurité pourrait devenir rouge du jour au lendemain. | **Décision** : la CI lance la checklist (déterministe) ; Trivy se rejoue à la main avant une livraison (`--trivy`, une dizaine de minutes). Seule une vulnérabilité **critique** non justifiée fait échouer l'audit ; les hautes sont affichées. |

## Ce qui n'est pas couvert

- Le code applicatif (injections, contrôle d'accès, validation des entrées) : traité par les tests des services et les revues, pas par cet audit.
- Le chiffrement du transport (HTTPS) et la sécurité du système hôte.
- La chaîne d'approvisionnement au-delà de Trivy (signature des images, SBOM).
- Les en-têtes de sécurité, la CSP et les routes internes du reverse proxy : vérifiés par `check-security-headers.sh` (issue #54).

## Preuves

- **L'audit peut échouer** : lancé sur la pile construite avec l'ancien `compose.yaml` (sans durcissement), il signale exactement les 12 contrôles de durcissement et laisse les 30 autres conformes.
- **Non-régression** après correctifs : test de fumée 50/50, en-têtes et blocages du proxy conformes, aucune ligne d'erreur dans les journaux des services.
- **Compatibilité des mots de passe** (E1) : voir l'écart E1.
