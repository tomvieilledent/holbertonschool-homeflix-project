# Homeflix — Frontend

React 19 + Vite + React Router.

## Démarrage

```bash
npm install
cp .env.example .env.local   # optionnel
npm run dev                  # http://localhost:5173
npm run lint
npm test                      # tests Vitest
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
| `styles/` | `tokens.css` (design tokens) et styles de base |
| `assets/logo/` | Logos SVG (couleur, monochrome foncé, monochrome blanc) |

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

## Identité visuelle et design tokens

Palette, typographie, espacements, rayons, ombres et focus sont des variables CSS dans `src/styles/tokens.css`. Les composants n'utilisent que ces variables, jamais de valeur en dur.

- **Thème sombre** (par défaut) : `:root`. **Thème clair** : `<html data-theme="light">`.
- Couleurs de marque : corail `#F68657` (principale), jaune orangé `#F6B352` (secondaire), anthracite `#383A3F` (surface) et `#1F2124` (fond).
- Sur un bouton corail, le texte est `--color-on-primary` (`#1F2124`), jamais blanc (2,5:1).
- En thème clair, le corail ne passe pas en texte sur blanc : les liens utilisent `--color-link` (`#B83E0E`).
- Polices (chargées en local via `@fontsource-variable`) : Plus Jakarta Sans pour les titres (`--font-heading`), Roboto pour l'interface (`--font-ui`), Public Sans pour les textes longs et la navigation (`--font-text`, `--font-nav`).
- Logo : composant `<Logo />` (version couleur en thème sombre, monochrome foncée en thème clair). Taille minimale 48 px de haut, sinon utiliser le favicon.
- Les icônes (`favicon.*`, `apple-touch-icon.png`, `android-chrome-*`, `maskable-512x512.png`) et `site.webmanifest` sont dans `public/`.
- `og:image` est relatif dans `index.html` : le remplacer par l'URL absolue du site au déploiement.

Vérifier les contrastes WCAG AA (texte >= 4,5:1, éléments d'interface >= 3:1) dans les deux thèmes :

```bash
npm run check:contrast
```

## Composants de base

Dans `src/components/`, accessibles au clavier, stylés uniquement avec les tokens. Les props sont documentées en JSDoc dans chaque fichier.

| Composant | Rôle |
| --- | --- |
| `Button` | Variantes `primary`, `secondary`, `ghost`, `danger` ; états `disabled` et `loading` (occupé, clics ignorés, reste focalisable) |
| `Field` | Label visible relié à l'input, aide, erreur annoncée (`role="alert"`, `aria-invalid`, `aria-describedby`) |
| `Modal` | `role="dialog"` nommé par son titre, piège de focus, fermeture par Échap ou clic sur le fond, focus rendu au déclencheur |
| `ToastProvider` + `useToast()` | Notifications dans une région `aria-live` ; `role="alert"` pour les erreurs ; minuteur en pause au survol et au focus |
| `Spinner` | Indicateur de chargement (`role="status"`, libellé masqué visuellement) |
| `Skeleton` | Silhouette de chargement (`text`, `rect`, `circle`) ; décorative, ou annoncée comme statut si `label` est fourni |
| `EmptyState` | État vide : titre, description, icône décorative et actions (ex. « Explorer le catalogue ») |
| `ErrorState` | État d'erreur en français sans détail technique (`role="alert"`), bouton « Réessayer » via `onRetry` |
| `ErrorBoundary` | Filet de sécurité global (monté dans `App.jsx`) : une erreur de rendu affiche `ErrorState` au lieu d'une page blanche ; le détail reste dans la console |

```jsx
<ToastProvider>{/* à la racine de l'application */}</ToastProvider>

const { show } = useToast()
show('Profil enregistré', { variant: 'success' })
```

Les erreurs de route (rendu, chargement d'une page admin) sont gérées par `app/RouteErrorPage.jsx`, branchée comme `errorElement` du routeur.

`ToastProvider` n'est pas encore monté dans `App.jsx` : à faire au premier écran qui émet un toast.

## Développer sans backend (mocks MSW)

```bash
echo "VITE_USE_MOCKS=true" >> .env.local
npm run dev
```

Avec `VITE_USE_MOCKS=true`, MSW intercepte dans le navigateur les appels `/api/identity|library|acquisition/v1/...` et répond à partir des fixtures du contrat (`docs/api/fixtures`, via l'alias `@fixtures`). Le message `[mock] API simulée active` apparaît dans la console.

- **Comptes de démonstration** (mot de passe `mot-de-passe-12`) : `admin` (ADMIN), `famille` (USER), `invite` (désactivé : erreur `ACCOUNT_DISABLED`). Le premier profil (Alice) a des favoris et des reprises de lecture ; les deux autres ont des listes vides, pour tester les états vides.
- **Couverture** : tous les endpoints des trois contrats (auth et session, profils, comptes, catalogue, recherche, accueil, favoris, progression, ticket de streaming, dossiers, indexation, métadonnées, acquisition). Les droits sont simulés (401 sans session, 403 pour un USER sur les routes admin, `PROFILE_NOT_SELECTED` sans profil actif).
- **État** : les écritures (profils, favoris, progression, dossiers…) vivent en mémoire jusqu'au rechargement ; seule la session survit (sessionStorage). L'indexation et les téléchargements avancent à chaque consultation pour pouvoir tester le suivi.
- **Limites** : le flux vidéo n'est pas simulé (`/stream/{id}` renvoie « fichier introuvable » pour exercer l'écran d'erreur du lecteur) ; Acquisition n'a pas encore de fixtures JSON, ses données sont dans `src/mocks/db.js` ; tous les comptes partagent les mêmes profils.
- **Production** : le mode n'existe qu'avec `npm run dev` (`import.meta.env.DEV`). Le service worker est servi par un plugin Vite réservé au serveur de dev, pas copié dans `public/`. `npm run check:no-mocks` (après `npm run build`) vérifie qu'aucun mock ne se trouve dans `dist/`.
- **Tests** : `src/mocks/mocks.test.js` exécute les handlers avec `msw/node` (formes de réponse égales aux fixtures, droits, scénarios métier).

## Appels API et proxy

Le frontend appelle toujours des URLs relatives `/api/<service>/v1/...`.

- **Production** : nginx (`nginx.conf`) route `/api/identity|library|acquisition/` vers les services.
- **Développement** : le proxy Vite (`vite.config.js`) reproduit la même réécriture vers `localhost:8081` (identity), `8082` (library) et `8083` (acquisition).
