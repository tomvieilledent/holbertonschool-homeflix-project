# Tests de bout en bout (Playwright)

Ces tests pilotent un vrai navigateur (Chromium) contre HomeFlix démarré avec Docker Compose. Ils rejouent le parcours principal : connexion, choix du profil, recherche, lecture, reprise de la lecture.

## Ce qui est testé

| Fichier | Scénario |
|---|---|
| `tests/parcours-principal.spec.js` | Connexion, choix du profil, recherche de « sintel », lecture (la vidéo avance, déplacement dans la vidéo) |
| | Deux profils d'un même compte ont des listes « Ma liste » séparées |
| | Reprise : la position enregistrée est proposée (« Reprendre à… ») puis reprise (**demande #65**) |
| `tests/controles-acces.spec.js` | Mauvais mot de passe refusé, page protégée renvoyée vers la connexion, un utilisateur simple n'accède pas à l'administration |

Chaque test crée son **propre compte** (nom aléatoire, profils Alice et Bob) par l'API d'administration et le **supprime à la fin** : les tests ne dépendent ni de l'ordre, ni des données des autres, et ne laissent rien derrière eux (sauf le compte administrateur de test).

## Prérequis

1. Une pile HomeFlix démarrée (voir le [README du dépôt](../../README.md)) **avec les films de démonstration** :

   ```bash
   cd homeflix
   ./scripts/gen-secrets.sh            # une seule fois
   ./scripts/fetch-demo-media.sh       # films libres, environ 250 Mo
   docker compose up --build -d --wait
   ```

2. Docker (les tests tournent dans l'image officielle de Playwright, rien à installer sur votre machine).

## Lancer les tests

Depuis `homeflix/e2e`, sur une pile **neuve** (le code d'installation sert à créer l'administrateur de test) :

```bash
set -a; . ../.env; set +a
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp --network host --ipc=host \
  -v "$PWD":/e2e -w /e2e \
  -e E2E_BASE_URL=http://localhost:8080 -e E2E_SETUP_TOKEN="$SETUP_TOKEN" \
  mcr.microsoft.com/playwright:v1.64.1-noble \
  sh -c 'npm ci --no-audit --no-fund && npx playwright test'
```

- `--user` évite que les fichiers créés (rapports, identifiants de test) appartiennent à `root`.
- Au premier lancement, l'administrateur `e2e-admin` est créé avec un mot de passe aléatoire écrit dans `.state.json` (droits 600, ignoré par Git). Les lancements suivants le réutilisent : **`E2E_SETUP_TOKEN` n'est plus nécessaire**.
- Sur une pile **déjà initialisée** par vos soins, donnez un administrateur existant : `-e E2E_ADMIN_USERNAME=… -e E2E_ADMIN_PASSWORD=…`.
- Autre adresse que `http://localhost:8080` : `E2E_BASE_URL`.

Sans Docker : Node 20 ou plus, puis `npm ci`, `npx playwright install --with-deps chromium` et `npx playwright test` (mêmes variables).

Durée : environ 30 secondes pour les 6 tests.

## Quand un test échoue

Pour chaque échec, Playwright conserve dans `test-results/` une **capture d'écran**, une **vidéo** et une **trace** (actions, requêtes réseau, état de la page). Le rapport HTML est dans `playwright-report/`.

```bash
npx playwright show-trace test-results/<dossier-du-test>/trace.zip
npx playwright show-report
```

## Intégration continue

Le workflow [`E2E`](../../.github/workflows/e2e.yml) lance ces tests sur la pile complète. Il est **facultatif** : il se déclenche à la main (onglet Actions, « Run workflow ») et ne bloque aucune pull request. Il publie le rapport et les traces comme artefacts.

## Limites connues

- Les tests supposent les films de démonstration (ils cherchent « sintel »). Sans eux, la préparation s'arrête avec un message qui l'explique.
- Un test à la fois (une seule pile partagée).
- Navigateur testé : Chromium uniquement ; la lecture H.264 y fonctionne.
- Pas encore couverts : les écrans d'administration (dossiers, comptes, téléchargements), qui sont des maquettes tant que les issues du frontend ne sont pas livrées.
