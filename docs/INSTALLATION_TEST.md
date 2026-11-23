# Test d'installation en suivant uniquement le README

Journal du test de l'issue #112 : installer HomeFlix depuis un clone du dépôt, en suivant **uniquement** le [`README.md`](../README.md), jusqu'à la première lecture, et noter chaque friction.

- **Date** : 2026-11-23
- **Version testée** : `main` au commit `56b776f`
- **Machine** : Linux sous WSL 2, Docker 29.9.3, Compose 5.7.1, 15 Go de mémoire, port 8080 libre. Aucun conteneur HomeFlix en cours.

## Limites de ce test

- La machine **n'est pas vierge** : Docker et les images de base (Temurin, nginx, PostgreSQL, Transmission) étaient déjà présentes. J'ai donc construit les images **sans cache** (`docker compose build --no-cache`) avant de lancer la commande du README, pour mesurer un démarrage à froid. Le temps de téléchargement des images de base n'est pas inclus.
- Le test a été fait par la personne qui connaît le projet, **pas par une personne extérieure** (case de l'issue non cochée).
- Le parcours dans le navigateur est piloté par Chromium (Puppeteer) ; les commandes de la section 3 du README ont été exécutées telles quelles.

## Déroulé

| Étape du README | Résultat | Durée |
|---|---|---|
| 1. Cloner le dépôt par l'adresse du README | **Échec sans identifiants** : le dépôt est privé (F1) | — |
| 2. `./scripts/gen-secrets.sh` | `.env` créé (droits 600), 18 variables ajoutées | < 1 s |
| 3. `MEDIA_DIR` + `./scripts/fetch-demo-media.sh` | Deux films téléchargés, intégrité vérifiée, 250 Mo (F2) | 58 s |
| 4. `docker compose up --build -d --wait` | 6 services `healthy` | 186 s de construction sans cache, puis 96 s (F3) |
| 5. Page d'accueil puis `/setup` | La racine du site affiche la connexion, comme annoncé ; formulaire de création de l'administrateur ([capture](installation/02-setup.png)) | — |
| Création de l'administrateur | Fonctionne, message conforme au README ; **un champ « Confirmation » absent du README** (F4) | — |
| Jeton, dossier `/media`, indexation, profil, compte d'un proche | Toutes les commandes marchent **telles quelles** : 201, 202, indexation `COMPLETED` avec 2 films ajoutés, 201, 201 | quelques secondes |
| Connexion, profil, accueil, catalogue, recherche, fiche | Fonctionnent ; le profil unique est choisi automatiquement ; l'accueil s'affiche sans erreur ([capture](installation/05-accueil.png)) | — |
| Lecture du film | La vidéo (596 s) se charge, l'avance à 200 s fonctionne ([capture](installation/09-lecture.png)) | — |

**Résultat : l'installation réussit sans aide jusqu'à la première lecture.**

## Frictions et corrections

| # | Constat | Correction dans le README |
|---|---|---|
| F1 | Le clonage par l'adresse du README échoue sans identifiants : le dépôt est privé. | Note ajoutée à l'étape 1 |
| F2 | Le script de films de démonstration ne dit ni sa durée ni son volume. | « environ 250 Mo, environ 1 minute » |
| F3 | Le premier démarrage annonçait « environ 3 minutes » : 4 min 40 s mesurées à froid ici. | « de 3 à 5 minutes » et « environ une minute et demie » ensuite |
| F4 | Le formulaire `/setup` demande une **confirmation du mot de passe** que le tableau du README ne listait pas. | Ligne ajoutée au tableau |
| F5 | Le README disait que l'Accueil « peut afficher une erreur » : c'est périmé depuis #226. | Remplacé par l'état réel |
| F6 | Le README promettait « la position est enregistrée et reprise à la prochaine lecture » : **faux aujourd'hui**. Pendant 45 s de lecture, le navigateur n'émet qu'un `GET` de progression, jamais de `PUT`, et la fiche affiche « Lecture » au retour, pas « Reprendre à… » (issue #65). | Promesse retirée, limite expliquée |
| F7 | Les titres affichés sont les noms de fichier (`big-buck-bunny-2008-640`) ; le README parlait de « filtre par genre » sans dire que les genres sont vides sans métadonnées. | Note ajoutée, mention du filtre par genre retirée |
| F8 | Le README disait que la route de téléchargement n'existait pas : elle existe depuis #225 (par l'API), mais l'état n'avance pas sans #99. | Section P2P corrigée |
| F9 | « Choisissez votre profil (Qui regarde ?) » : avec un seul profil, l'écran est sauté. | Phrase ajoutée |

Observation sans correction : au premier chargement, le navigateur émet un `POST /auth/refresh` qui répond 401. C'est normal (aucune session), mais visible dans la console du navigateur.

## Mesures utiles pour le README

- Mémoire au repos : **1 431 Mio** pour les six conteneurs (le README annonce environ 1,3 Go).
- Images Docker : environ 1,3 Go pour les quatre images HomeFlix (397, 397, 407 et 74 Mo), plus PostgreSQL et Transmission ; le README annonce environ 2 Go.

## Ce qui reste à faire

- Faire exécuter l'installation par **une personne extérieure** sur une machine propre (non fait).
- Refaire le test après l'ajout des écrans d'administration, de la gestion des profils (#76) et de la sauvegarde de la progression (#65), qui changeront la section 3.
