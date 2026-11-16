# Homeflix — Frontend

React 19 + Vite + React Router.

## Démarrage

```bash
npm install
cp .env.example .env.local   # optionnel
npm run dev                  # http://localhost:5173
npm run lint
npm run build
```

## Structure de `src/`

| Dossier | Rôle |
| --- | --- |
| `app/` | Point d'entrée applicatif : `App.jsx`, `router.jsx`, `config.js`, page 404 |
| `features/<nom>/` | Code par fonctionnalité : `auth`, `catalogue`, `player`, `admin` (pages, composants et hooks propres à la fonctionnalité) |
| `components/` | Composants UI partagés entre fonctionnalités |
| `services/` | Accès à l'API (`api.js` : `apiFetch(service, path)`) |
| `hooks/` | Hooks partagés |
| `styles/` | Feuilles de style globales |

## Conventions

- Alias `@` → `src/` (ex. `import { config } from '@/app/config'`).
- Composants et pages en `PascalCase.jsx` ; hooks `useXxx.js` ; services/utilitaires en `camelCase.js`.
- Une fonctionnalité n'importe pas le code interne d'une autre : ce qui est partagé va dans `components/`, `hooks/` ou `services/`.

## Routes

| Chemin | Page |
| --- | --- |
| `/` | Accueil (catalogue) |
| `/login` | Connexion |
| `/profiles` | Choix du profil |
| `/media/:mediaId` | Détail d'un média |
| `/watch/:mediaId` | Lecteur |
| `/admin`, `/admin/acquisition` | Administration (chargées à la demande via `React.lazy`) |
| `*` | Page introuvable |

## Configuration (`VITE_*`)

Voir `.env.example`.

| Variable | Défaut | Description |
| --- | --- | --- |
| `VITE_API_BASE` | `/api` | Base **relative** de l'API (fonctionne derrière nginx) |
| `VITE_APP_NAME` | `Homeflix` | Nom affiché |
| `VITE_DEV_PROXY_HOST` | `localhost` | Hôte des microservices pour le proxy de dev |

## Appels API et proxy

Le frontend appelle toujours des URLs relatives `/api/<service>/v1/...`.

- **Production** : nginx (`nginx.conf`) route `/api/identity|library|acquisition/` vers les services.
- **Développement** : le proxy Vite (`vite.config.js`) reproduit la même réécriture vers `localhost:8081` (identity), `8082` (library) et `8083` (acquisition).
