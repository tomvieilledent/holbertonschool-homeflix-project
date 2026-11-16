# ADR 0001 — Identité et sécurité entre services

- **Statut** : proposé (à valider par l'équipe, voir la PR)
- **Date** : 2026-11-16
- **Décideurs** : Tom, Jason, Haitu

## Contexte

Trois services Spring Boot (Identity, Library, Acquisition) ont chacun leur base. Library et Acquisition doivent savoir **qui** appelle et avec **quel rôle**, sans lire les tables d'Identity. La progression et les favoris sont isolés par profil : le profil actif doit être connu du serveur et ne pas dépendre d'un identifiant fourni par le client. Le lecteur vidéo (`<video>`) ne peut pas envoyer d'en-tête `Authorization`. Aucun accès ordinaire ne doit atteindre les API internes.

## Décisions

### 1. Access token : JWT RS256 de 15 minutes, validé via JWKS

- Identity signe les jetons avec une clé privée RSA (jamais committée, fournie par volume ou variable d'environnement) et publie la clé publique sur `GET /.well-known/jwks.json` (réseau interne uniquement).
- Library et Acquisition sont des *resource servers* : ils valident la signature, l'expiration, l'émetteur et le `kid` avec le JWKS (mis en cache, rechargé si `kid` inconnu). Aucun appel à Identity à chaque requête.
- Claims : `sub` (identifiant du compte), `roles` (`USER`/`ADMIN`), `pid` (profil actif, optionnel), `iss`, `iat`, `exp`, `kid` en en-tête.
- Le rôle est celui du moment de l'émission : une désactivation de compte prend effet au prochain refresh (15 min au plus). Compromis accepté pour le MVP, documenté dans les limites connues.

### 2. Refresh token : opaque, rotatif, en cookie HttpOnly

- Le refresh token est une valeur aléatoire ; Identity ne stocke que son hash SHA-256 avec une date d'expiration.
- Cookie `refresh_token` : `HttpOnly; Secure` (hors dev local) ; `SameSite=Strict` ; `Path=/api/v1/auth`.
- Rotation à chaque `POST /auth/refresh` ; la réutilisation d'un ancien jeton révoque toute la famille de jetons (vol présumé).
- L'access token est conservé **en mémoire** par le frontend (jamais dans `localStorage`) ; au rechargement de la page, un refresh le restaure.
- Déconnexion : révocation côté serveur et effacement du cookie.

### 3. Protection CSRF

Le cookie n'est lu que par `/auth/refresh` et `/auth/logout`. Ces routes exigent `SameSite=Strict` **et** l'en-tête `X-Requested-With: homeflix` (un formulaire inter-sites ne peut pas l'envoyer). Les autres routes utilisent un en-tête `Authorization`, non soumis au CSRF.

### 4. Profil actif dans le jeton (`pid`)

- `POST /profiles/{id}/select` vérifie que le profil appartient au compte et retourne un nouveau JWT contenant `pid`.
- Library lit le profil **uniquement** dans `pid` pour la progression, les favoris et l'accueil. Une route liée au profil sans `pid` répond `409 PROFILE_NOT_SELECTED`.
- Un profil d'un autre compte répond `404`, pas `403`, pour éviter l'énumération.

### 5. Ticket de streaming signé

- `POST /media/{id}/stream-ticket` (JWT requis) retourne une URL `.../stream/{id}?t=<ticket>`.
- Le ticket est un JWT court (audience `stream`) lié à `sub`, `pid` et `mediaId`, valable 2 h, non réutilisable sur un autre média. Il est signé avec la clé propre à Library (aucune dépendance à Identity).
- Les tickets ne sont jamais journalisés ; le proxy ne conserve pas la query string dans ses logs d'accès.

### 6. Appels internes entre services

- Routes sous `/internal/**`, jamais routées par le reverse proxy.
- Authentification par un secret partagé **par destinataire** (`INTERNAL_API_KEY`), envoyé dans l'en-tête `X-Internal-Key` et comparé en temps constant ; refus par défaut.
- Cas d'usage : Identity → Library (purge à la suppression d'un compte ou d'un profil), Acquisition → Library (fichier téléchargé, réindexation).
- Timeouts de 3 s et 2 tentatives maximum ; une dépendance indisponible produit un `503` au format `problem+json` (voir `docs/api/CONVENTIONS.md`).

### 7. Mots de passe et secrets

- Mots de passe hachés en Argon2id ; longueur minimale de 12 caractères.
- Aucun secret dans le dépôt : `.env` ignoré, `.env.example` avec des valeurs `CHANGE_ME`.
- Premier administrateur : jeton de setup à usage unique, jamais de compte par défaut.

## Conséquences

- Library et Acquisition fonctionnent même si Identity est momentanément arrêté, tant que le JWKS est en cache.
- Le frontend doit gérer le refresh automatique sur `401 SESSION_EXPIRED` et le changement de jeton après la sélection d'un profil.
- La rotation de la clé de signature demande de publier deux clés dans le JWKS pendant la transition (hors périmètre du MVP).

## Alternatives écartées

| Alternative | Raison du rejet |
|---|---|
| Sessions serveur (cookie de session) | Demande un état partagé entre services ou des appels à Identity à chaque requête |
| JWT HS256 avec secret partagé | Chaque service pourrait forger des jetons ; secret à distribuer partout |
| Appel d'introspection à Identity à chaque requête | Couplage fort, latence, panne en cascade |
| Access token dans `localStorage` | Exposé à toute faille XSS |
| JWT dans l'URL du flux vidéo | Jeton de session long visible dans logs et historique ; remplacé par un ticket court lié au média |
| Profil dans l'URL ou le corps | Falsifiable (IDOR) ; le profil doit venir d'une source signée |
