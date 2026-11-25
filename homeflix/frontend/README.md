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

## Tests

Vitest + Testing Library + jest-dom, environnement jsdom (configuration dans `vite.config.js`, matchers dans `src/test/setup.js`).

```bash
npm test                              # une exécution (celle de la CI)
npm run test:watch                    # relance les tests concernés à chaque modification
npm test -- src/components/Button.test.jsx   # un seul fichier
npm run test:journeys                 # seulement les parcours critiques (voir ci-dessous)
npm run lint                          # oxlint, y compris les règles des tests
```

- **Emplacement** : un fichier `Nom.test.jsx` à côté du code testé. `globals: true` : le nettoyage du DOM entre les tests est automatique.
- **Exemple de test de composant** : `src/components/Button.test.jsx` (rendu, interactions clavier et souris avec `userEvent`, états `disabled` et `loading`). Les requêtes se font par rôle accessible (`getByRole`, `getByLabelText`), comme le ferait un utilisateur ; `Modal.test.jsx` et `Toast.test.jsx` montrent les cas plus complets (focus, minuteurs).
- **Appels d'API** : MSW côté Node (`setupServer` de `msw/node`), voir `src/mocks/mocks.test.js`.
- **Lint des tests** : un `it.only` ou `describe.only` oublié (qui ferait passer la CI en ne lançant presque rien) et deux tests au même titre sont des erreurs ; un test désactivé (`it.skip`) est signalé.
- **Windows** : `npm test` passe par `scripts/vitest.mjs`, qui relance Vitest depuis le chemin canonique. Sans cela, un terminal ouvert en `c:\...` (lettre de lecteur en minuscule, fréquent dans VS Code) fait échouer tous les fichiers avec « Vitest failed to find the runner ». Si vous lancez `npx vitest` directement depuis un tel terminal, passez plutôt par `npm test`.

### Parcours critiques

`src/journeys/parcours.test.jsx` rejoue les parcours de l'utilisateur **de bout en bout dans l'application** : routeur et session réels, pages réelles, et seulement le réseau simulé par MSW à partir des contrats et des fixtures (`src/mocks`, voir « Développer sans backend »). Chaque test décrit un comportement visible, pas une implémentation. Le banc d'essai (`src/journeys/harness.jsx`) fournit les gestes communs : `openApp`, `signInAs`, `switchProfile`, `goTo`, `loadVideo`, `pauseAt`.

| Parcours | Ce que les tests vérifient |
| --- | --- |
| Connexion | Redirection vers la connexion puis retour à la page demandée après le choix du profil ; mot de passe incorrect sans révéler si le compte existe ; session conservée au rechargement ; déconnexion ; session perdue expliquée |
| Garde de route | Un utilisateur ordinaire ne voit pas l'administration et reçoit « Accès refusé » par URL directe ; un administrateur y accède ; sans profil, on est renvoyé vers « Qui regarde ? » |
| Sélection de profil | Chaque profil a ses propres données (reprise de lecture, « Ma liste ») ; créer un profil puis le choisir |
| Lecteur et progression | Trouver un film, le lire, le mettre en pause, le reprendre à la bonne position après un rechargement ; enregistrement en quittant la page ; « Recommencer » ; positions distinctes par profil ; reprise depuis « Continuer à regarder » |
| Favoris | Ajouter ou retirer met à jour toutes les vues tout de suite ; favoris propres à chaque profil ; un refus du serveur restaure l'état précédent avec un message sans détail technique |
| Erreurs | Fichier manquant, ticket de lecture expiré (renouvelé sans perdre sa place), film indisponible, service injoignable avec « Réessayer » |

Ce qui complète ces parcours : les tests de chaque écran (à côté de son code), `src/services/*.test.js` pour le client d'API, la session et la progression, et `src/mocks/mocks.test.js` pour la conformité des mocks aux contrats. La CI exécute le tout avec `npm test` (job « Frontend »). Les parcours sur la vraie pile Compose, dans un navigateur, sont dans `homeflix/e2e` (Playwright).

**Limites assumées** : jsdom ne lit pas de vidéo, les parcours de lecture simulent donc les événements de la balise `<video>` (`loadedmetadata`, `timeupdate`, `pause`, `error`) ; l'API simulée est plus stricte que le vrai service sur une chose : après une déconnexion, elle refuse aussitôt le jeton, alors que le vrai service accepte un jeton JWT jusqu'à son expiration.

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

## Session, mise en page et routes protégées

- `AuthProvider` (monté dans `App.jsx`) rouvre la session au démarrage via le cookie `refresh_token` puis `GET /auth/me`. `useAuth()` expose `status` (`loading`, `authenticated`, `anonymous`), `account` (avec son `role`), `login()` et `logout()`. L'access token reste en mémoire (`services/auth.js`), jamais dans `localStorage`.
- `RequireAuth` redirige un anonyme vers `/login?next=<destination>` (requête et ancre conservées) ; pendant `loading`, il affiche un indicateur au lieu de rediriger. `RequireRole role="ADMIN"` affiche « Accès refusé » à un compte sans ce rôle. Ces gardes sont un confort d'interface : l'autorisation réelle reste vérifiée par les services.
- La page de connexion doit relire la destination avec `safeNext()` (`features/auth/redirect.js`), qui n'accepte que des chemins internes (pas d'URL absolue ni de `//`).
- `AppLayout` : lien d'évitement « Aller au contenu principal » (premier élément focalisable), en-tête, navigation (le lien « Administration » n'apparaît que pour un `ADMIN`) et menu du compte (changer de profil, se déconnecter ; Échap le ferme). `BareLayout` sert la connexion, le choix du profil et la page 404, sans en-tête.
- La table des routes est exportée (`routes` dans `app/router.jsx`) pour être testée avec un routeur en mémoire.

## Client d'API

Tous les appels passent par `apiFetch(service, path, options)` (`services/api.js`) :

```js
const page = await apiFetch('library', '/v1/media', { query: { q: 'sintel', page: 0 }, signal })
await apiFetch('library', '/v1/me/favourites/' + id, { method: 'PUT' })
await apiFetch('identity', '/v1/auth/login', { method: 'POST', auth: false, body: { username, password } })
```

- **Jeton** : l'access token (en mémoire) est ajouté en `Authorization: Bearer`. `auth: false` pour un endpoint anonyme.
- **401 → refresh** : sur un 401, le client renouvelle le jeton puis rejoue la requête **une seule fois**. Les requêtes simultanées partagent un seul refresh (le refresh token est à usage unique). `AUTH_INVALID_CREDENTIALS` et `TICKET_EXPIRED` ne déclenchent pas de refresh. Un second 401 après le rejeu, ou un refresh refusé, met fin à la session.
- **Session perdue** : le client lève `SESSION_EXPIRED` et prévient `AuthProvider` (`onSessionExpired`) ; l'utilisateur est redirigé vers `/login` avec le message « Votre session a expiré ». Une simple panne réseau pendant le refresh ne déconnecte pas.
- **Erreurs** : toute erreur est une `ApiError` avec `status`, `code`, `fieldErrors` (validation) et `retryAfter` (429). Son `message` est un texte français choisi d'après le `code` (`services/errorMessages.js`) : **le `detail` du serveur n'est jamais affiché**. Une panne réseau donne `NETWORK_ERROR`, une réponse sans problem+json un message d'après le statut. `downloadFailureMessage(errorCode)` traduit l'échec d'un téléchargement.
- **Annulation** : passer un `AbortSignal` (`signal`). La requête annulée est rejetée avec une `AbortError` (à ignorer avec `isAbortError(error)`), sans refresh ni message d'erreur.
- Un test vérifie que chaque code de `docs/api/CONVENTIONS.md` et des fixtures d'erreur a un message.

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
