# Environnement de démonstration

Pour présenter HomeFlix, on part toujours du même état : une pile vierge avec des comptes, des profils et un catalogue prêts. Un script remet tout à zéro : `homeflix/scripts/reset-demo.sh`.

> **Les comptes de démonstration ne sont pas faits pour un vrai usage.** Leurs noms sont publics (ils figurent dans ce document) et l'un d'eux est administrateur. Ne les créez jamais sur une installation réelle, et ne réutilisez jamais le mot de passe de démonstration ailleurs, en particulier pas en production.

## Remettre la démonstration à zéro

Depuis le dossier `homeflix/` :

```bash
./scripts/reset-demo.sh          # demande de taper RESET pour confirmer
./scripts/reset-demo.sh --yes    # sans confirmation (avant une présentation, par exemple)
./scripts/reset-demo.sh --build  # reconstruit aussi les images (après un changement de code)
```

Prérequis : Docker Compose, `curl`, `openssl`, et les films de démonstration dans `homeflix/demo-media/` (voir `./scripts/fetch-demo-media.sh` et [`legal/DEMO_MEDIA.md`](legal/DEMO_MEDIA.md)). Le script le vérifie **avant** de rien effacer.

### Ce qui est effacé, ce qui est conservé

| Effacé (`docker compose down -v`) | Conservé |
|---|---|
| Comptes, profils, catalogue, progression, favoris | Le fichier `.env` et ses secrets |
| Téléchargements en cours ou terminés (volume `downloads`) | Les images Docker |
| État de Transmission | Vos films (`MEDIA_DIR`) |

Si vous avez choisi un dossier de l'hôte avec `DOWNLOADS_DIR`, il n'est **pas** vidé : le script le signale, à vous de supprimer son contenu.

### Ce qui est créé

| Compte | Rôle | Profils |
|---|---|---|
| `demo-admin` | Administrateur | Admin |
| `demo-famille` | Utilisateur | Alice, Bob |
| `demo-invite` | Utilisateur | Invité |

Le script déclare aussi les dossiers `/media` (films de démonstration) et `/downloads` (films téléchargés) dans Library, indexe les films, puis corrige leurs métadonnées (titre, année, genres et mention de la licence CC BY 3.0, voir [`legal/DEMO_MEDIA.md`](legal/DEMO_MEDIA.md)). Alice et Bob permettent de montrer deux profils avec des favoris et une progression séparés.

### Le mot de passe de démonstration

Il n'est écrit nulle part dans le dépôt : le script en tire un **au hasard à chaque reset**, le même pour les trois comptes. Il l'affiche à la fin et l'enregistre dans `homeflix/.demo-credentials` (droits 600, ignoré par Git). Pour en imposer un, de 12 à 128 caractères, sans guillemet (`"`), sans barre oblique inverse (`\`) ni caractère de contrôle : `DEMO_PASSWORD=... ./scripts/reset-demo.sh --yes`. Le fichier `.demo-credentials` est supprimé au début de chaque reset : s'il existe, il correspond au dernier reset réussi.

Conséquence pratique : après chaque reset, relire le mot de passe (affiché par le script, ou `cat homeflix/.demo-credentials`).

## Garde-fous

Le script refuse de continuer, **sans rien effacer**, dans ces cas : pas de confirmation (ou réponse autre que `RESET`), aucun film dans `MEDIA_DIR`, mot de passe imposé hors des 12 à 128 caractères ou contenant un guillemet, une barre oblique inverse ou un caractère de contrôle, option inconnue. Il avertit si `demo-media/` contient Sintel : pour la démonstration du téléchargement P2P ([`legal/P2P_DEMO.md`](legal/P2P_DEMO.md)), Sintel doit arriver par BitTorrent.

Il agit sur le projet Docker courant (`homeflix` par défaut). Pour l'essayer sans toucher à votre vraie pile : `COMPOSE_PROJECT_NAME=autre-nom FRONTEND_PORT=8097 ./scripts/reset-demo.sh --yes`.

## Durée

Le démarrage des trois services Java (en chaîne : base, Identity, puis Library et Acquisition, puis frontend) représente presque tout le temps ; la création des comptes et l'indexation prennent environ 10 secondes.

Mesures sur un portable de développement, images déjà construites, 6 resets complets réussis : **60 s, 80 s, 96 s, 132 s, 141 s et 172 s**. Le critère « moins de 2 minutes » est donc tenu sur une machine peu chargée, pas à chaque fois : avant une présentation, lancer le reset **au moins 5 minutes avant** et vérifier la connexion.

## Incident observé : un service Java qui plante au démarrage

Sur la machine de développement, 2 démarrages sur 7 ont vu un service Java (Identity ou Acquisition) s'arrêter avec le code 139 (plantage de la JVM, une fois précédé d'une erreur de lecture d'un fichier de classe). La politique de redémarrage le relance et il devient `healthy`, mais `docker compose up --wait` abandonne dès le premier échec. Le script réessaie donc jusqu'à 5 fois, 20 secondes d'écart. La cause du plantage n'est pas établie (le test de fumée de la CI ne l'a jamais montré) ; c'est un point à surveiller avant la soutenance.

## Ce qui a été vérifié

- Exécuté plusieurs fois de suite sur une pile isolée : à chaque fois, trois comptes qui se connectent, deux films `AVAILABLE` avec leurs genres.
- Preuve que le reset efface vraiment : un compte ajouté avant le reset se connecte (200) avant et est refusé (401) après ; l'ancien mot de passe de démonstration est refusé, le nouveau est accepté.
- Preuve des garde-fous : sans confirmation, sans film, mot de passe trop court, rien n'est effacé et la pile précédente répond toujours.
