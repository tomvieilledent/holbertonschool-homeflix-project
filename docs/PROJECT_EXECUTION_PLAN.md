# Plan d'exécution HomeFlix
> Généré avec le backlog GitHub. Source de vérité : le [GitHub Project](https://github.com/users/tomvieilledent/projects/1) et les issues. Calendrier : développement du lundi 16 au mercredi 25 novembre (8 jours, 8h–17h), jeudi 26 : préparation de la présentation, vendredi 27 : présentation.
## 1. État du dépôt (audit du 16/11)
| Élément | État |
|---|---|
| identity / library / acquisition (Spring Boot 4.1.2, Java 21) | Squelettes seulement : une classe principale + test `contextLoads`, aucun endpoint ni entité |
| `identity-service` | Config datasource par variables d'environnement ; `V1__init.sql` **vide** |
| `library-service`, `acquisition-service` | **Aucune config datasource** alors que Flyway/JPA sont présents (démarrage impossible sans variables) ; pas de migration |
| Sécurité | `spring-boot-starter-security` présent, aucune `SecurityFilterChain` : tout est protégé par défaut (santé incluse) |
| Frontend | React 19 + Vite, **converti de TypeScript en JavaScript** (commit `refactor(frontend)`), page d'exemple Vite uniquement |
| Infra | Ajout de `homeflix/compose.yaml`, Dockerfiles, `nginx.conf`, `.env.example`, init des bases (démarrage vérifié) |
| Tests / CI / OpenAPI / client BitTorrent | Inexistants |
## 2. Architecture cible
- Un reverse proxy nginx (image frontend) est le seul point d'entrée : `/api/identity/…`, `/api/library/…`, `/api/acquisition/…` (préfixe retiré, les services exposent `/api/v1/…`). `/internal` et `/actuator` ne sont jamais routés.
- Identity : comptes, rôles, profils, JWT RS256 (15 min) + JWKS, refresh opaque rotatif en cookie HttpOnly. Library et Acquisition valident les jetons via JWKS, sans accéder à la base d'Identity.
- Library : dossiers autorisés, indexation, catalogue, streaming HTTP Range via ticket signé, favoris, progression (profil lu dans le jeton `pid`).
- Acquisition : catalogue autorisé, rappel des droits, pilotage de Transmission (réseau interne uniquement), remise du fichier à Library.
- Une base PostgreSQL par service (rôles distincts), volumes `pgdata`, `downloads`, médias montés en lecture seule.
## 3. Charge et équilibre
| Développeur | Issues | Charge estimée | Jours-équivalents (8 h) | P0 | P1 | P2/P3 |
|---|---|---|---|---|---|---|
| Jason | 45 | 69.5 h | 8.7 j | 39.5 h | 27.5 h | 2.5 h |
| Tom | 43 | 71.0 h | 8.9 j | 45.5 h | 24.0 h | 1.5 h |
| Haitu | 40 | 79.0 h | 9.9 j | 51.5 h | 24.0 h | 3.5 h |
| **Total** | 128 | 219.5 h | 27.4 j | | | |

Capacité de développement : 8 jours × 8 h = 64 h par personne (J9 = présentation, J10 = soutenance). **La charge de développement est proche de 100 % de cette capacité, avec des pics supérieurs à 8 h sur certains jours** : les estimations supposent un développement assisté par IA, et aucun développeur n'a de marge. Voir les risques.

### Charge par jour (heures, répartition linéaire)

| Dév | J1 | J2 | J3 | J4 | J5 | J6 | J7 | J8 | J9 | J10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Jason | 3.8 | 6.5 | 7.2 | 6.8 | 6.8 | 9.7 | 12.9 | 8.7 | 5.0 | 2.0 |
| Tom | 7.2 | 3.5 | 6.0 | 8.0 | 10.2 | 9.0 | 13.2 | 8.8 | 3.0 | 2.0 |
| Haitu | 7.2 | 9.2 | 8.8 | 4.5 | 7.8 | 7.0 | 11.0 | 12.8 | 8.8 | 2.0 |

## 4. Planning et points d'intégration

| Jour | Date | Objectif | Point d'intégration |
|---|---|---|---|
| J1 | 2026-11-16 | Contrats OpenAPI, ADR, ERD, squelettes, Docker, conventions | Architecture validée |
| J2 | 2026-11-17 | Fondations backend/frontend/infra, CI | Services démarrables, communication Library→Identity |
| J3 | 2026-11-18 | Auth, dossiers médias, composants UI | — |
| J4 | 2026-11-19 | Login, indexation, catalogue, streaming | Première auth + indexation + catalogue + lecture |
| J5 | 2026-11-20 | Profils, Range, accueil, intégration auth | Revue de mi-parcours, réduction de périmètre |
| J6 | 2026-11-23 | Progression, favoris, admin, acquisition (catalogue/client) | — |
| J7 | 2026-11-24 | Acquisition, administration, accueil agrégé | Profils, progression, favoris, admin, acquisition |
| J8 | 2026-11-25 | Finalisation, sécurité, responsive, a11y, docs | Fonctionnalités obligatoires terminées |
| J9 | 2026-11-26 | Acceptation, installation vierge, P2P réel, corrections | Gel du périmètre |
| J10 | 2026-11-27 | Présentation, démo, rétrospective | — |

## 5. Backlog par développeur

### Jason

| # | Titre | Prio | Estim. | Début → Fin | Dépend de |
|---|---|---|---|---|---|
| [#5](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/5) | [FRONTEND] Définir l'architecture frontend (structure, routeur, configuration) | P0 | 1.5 h (S) | J1 (11-16) → J1 (11-16) | — |
| [#6](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/6) | [FRONTEND] Réaliser les maquettes et les parcours utilisateurs principaux | P0 | 1.5 h (S) | J1 (11-16) → J1 (11-16) | — |
| [#15](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/15) | [FRONTEND] Créer l'identité visuelle et les design tokens | P0 | 1.5 h (S) | J1 (11-16) → J2 (11-17) | #6 |
| [#21](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/21) | [FRONTEND] Construire les composants de base (Button, Field, Modal, Toast, Spinner) | P0 | 2.5 h (M) | J2 (11-17) → J2 (11-17) | #15 |
| [#22](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/22) | [FRONTEND] Créer les composants d'état : chargement, vide, erreur et ErrorBoundary | P0 | 1.0 h (S) | J2 (11-17) → J2 (11-17) | #21 |
| [#23](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/23) | [FRONTEND] Mettre en place un mock d'API (MSW) à partir des contrats et fixtures | P0 | 1.5 h (S) | J2 (11-17) → J2 (11-17) | #7, #8, #9 |
| [#26](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/26) | [FRONTEND] Mettre en place la mise en page, la navigation et les routes protégées | P0 | 1.5 h (S) | J2 (11-17) → J3 (11-18) | #5, #21 |
| [#31](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/31) | [FRONTEND] Développer le client API (erreurs problem+json, refresh automatique) | P0 | 1.5 h (S) | J3 (11-18) → J3 (11-18) | #5, #10 |
| [#32](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/32) | [TEST] Configurer Vitest, Testing Library et le lint | P1 | 1.0 h (S) | J3 (11-18) → J3 (11-18) | — |
| [#33](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/33) | [FRONTEND] Page de setup du premier administrateur | P0 | 1.0 h (S) | J3 (11-18) → J3 (11-18) | #21, #23 |
| [#34](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/34) | [FRONTEND] Page de connexion avec validation et états | P0 | 1.5 h (S) | J3 (11-18) → J3 (11-18) | #21, #23 |
| [#39](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/39) | [FRONTEND] Implémenter le contexte d'authentification et la gestion de session | P0 | 1.5 h (S) | J3 (11-18) → J4 (11-19) | #31 |
| [#40](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/40) | [FRONTEND] Créer la carte film et les badges de disponibilité | P0 | 1.5 h (S) | J3 (11-18) → J4 (11-19) | #15, #21 |
| [#43](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/43) | [FRONTEND] Écran de sélection de profil et profil actif | P0 | 1.5 h (S) | J4 (11-19) → J4 (11-19) | #39, #23 |
| [#44](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/44) | [FRONTEND] Page catalogue — grille et pagination | P0 | 1.5 h (S) | J4 (11-19) → J4 (11-19) | #40, #23 |
| [#47](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/47) | [FRONTEND] Page d'accueil — rangées récents, catégories, favoris et continuer à regarder | P0 | 2.0 h (S) | J4 (11-19) → J5 (11-20) | #40, #23, #26 |
| [#53](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/53) | [FRONTEND] Lecteur vidéo — lecture, pause, seek, volume et plein écran accessibles | P0 | 4.0 h (M) | J4 (11-19) → J6 (11-23) | #21, #23 |
| [#56](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/56) | [FRONTEND] Recherche par titre et filtres par genre | P0 | 1.5 h (S) | J5 (11-20) → J5 (11-20) | #44 |
| [#57](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/57) | [FRONTEND] Page de détails d'un film | P0 | 1.5 h (S) | J5 (11-20) → J5 (11-20) | #40, #23 |
| [#58](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/58) | [INTEGRATION] Brancher l'authentification et les profils sur les vrais services | P0 | 1.5 h (S) | J5 (11-20) → J5 (11-20) | #39, #34, #43, #45, #59 |
| [#65](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/65) | [FRONTEND] Sauvegarde périodique de la progression et reprise de lecture | P0 | 1.5 h (S) | J6 (11-23) → J6 (11-23) | #53 |
| [#66](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/66) | [FRONTEND] Gérer les erreurs de lecture (fichier manquant, accès refusé, format non supporté) | P1 | 1.0 h (S) | J6 (11-23) → J6 (11-23) | #53 |
| [#67](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/67) | [FRONTEND] « Ma liste » — ajout/retrait de favoris avec mise à jour optimiste | P0 | 1.0 h (S) | J6 (11-23) → J6 (11-23) | #40 |
| [#68](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/68) | [INTEGRATION] Brancher catalogue, détails, lecture et progression sur les vrais services | P0 | 1.5 h (S) | J6 (11-23) → J6 (11-23) | #47, #56, #57, #65, #49, #50, #63 |
| [#69](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/69) | [FRONTEND] Admin — mise en page et garde de rôle | P1 | 1.0 h (S) | J6 (11-23) → J6 (11-23) | #26 |
| [#76](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/76) | [FRONTEND] Gestion des profils (créer, renommer, supprimer) | P1 | 1.5 h (S) | J6 (11-23) → J7 (11-24) | #43 |
| [#77](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/77) | [FRONTEND] Admin — gestion des comptes et rôles | P1 | 2.0 h (S) | J6 (11-23) → J7 (11-24) | #69, #23 |
| [#80](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/80) | [TEST] Tests frontend des parcours critiques | P1 | 2.0 h (S) | J6 (11-23) → J8 (11-25) | #32, #34, #53, #65 |
| [#83](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/83) | [FRONTEND] Admin — configuration des dossiers médias | P1 | 1.5 h (S) | J7 (11-24) → J7 (11-24) | #69, #23 |
| [#84](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/84) | [FRONTEND] Admin — édition des métadonnées et suppression d'une entrée | P1 | 1.5 h (S) | J7 (11-24) → J7 (11-24) | #69, #57 |
| [#85](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/85) | [FRONTEND] Admin — catalogue d'acquisition et rappel des droits | P1 | 1.5 h (S) | J7 (11-24) → J7 (11-24) | #69, #23, #24 |
| [#101](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/101) | [FRONTEND] Admin — état des services | P2 | 1.0 h (S) | J7 (11-24) → J7 (11-24) | #69 |
| [#102](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/102) | [FRONTEND] Suppression de son compte et de ses données | P1 | 1.0 h (S) | J7 (11-24) → J7 (11-24) | #76 |
| [#86](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/86) | [SECURITY] Revue XSS et rendu sécurisé du contenu utilisateur | P1 | 1.0 h (S) | J7 (11-24) → J7 (11-24) | #57 |
| [#94](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/94) | [FRONTEND] Admin — lancement et suivi de l'indexation | P1 | 1.5 h (S) | J7 (11-24) → J8 (11-25) | #83 |
| [#95](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/95) | [FRONTEND] Admin — suivi des téléchargements (états, progression, annulation) | P1 | 1.5 h (S) | J7 (11-24) → J8 (11-25) | #85 |
| [#96](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/96) | [FRONTEND] Revue du responsive design (mobile, tablette, desktop) | P1 | 1.5 h (S) | J7 (11-24) → J8 (11-25) | #47, #53, #77 |
| [#103](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/103) | [SECURITY] Accessibilité — clavier, focus, ARIA et contrastes | P1 | 1.5 h (S) | J7 (11-24) → J8 (11-25) | #96 |
| [#104](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/104) | [INTEGRATION] Brancher l'administration et l'acquisition sur les vrais services | P1 | 1.5 h (S) | J8 (11-25) → J8 (11-25) | #77, #83, #94, #84, #95, #62, #38, #88 |
| [#105](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/105) | [FRONTEND] Onboarding du premier lancement et états vides guidés | P3 | 1.5 h (S) | J8 (11-25) → J8 (11-25) | #47 |
| [#120](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/120) | [BUG] Corriger les défauts d'intégration frontend (stabilisation J9) | P0 | 2.0 h (S) | J8 (11-25) → J8 (11-25) | #104 |
| [#117](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/117) | [DOCS] Captures d'écran et documentation du frontend | P1 | 1.5 h (S) | J9 (11-26) → J9 (11-26) | #104 |
| [#118](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/118) | [DOCS] Préparer les slides — expérience utilisateur et frontend | P1 | 1.5 h (S) | J9 (11-26) → J9 (11-26) | #117 |
| [#119](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/119) | [DOCS] Script et enregistrement de la partie démonstration de la vidéo | P1 | 2.0 h (S) | J9 (11-26) → J9 (11-26) | #104 |
| [#127](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/127) | [DOCS] Présentation finale — Présenter la partie produit/UX et répondre aux questions | P0 | 2 h (S) | J10 (11-27) → J10 (11-27) | #125 |

### Tom

| # | Titre | Prio | Estim. | Début → Fin | Dépend de |
|---|---|---|---|---|---|
| [#7](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/7) | [BACKEND] Définir le contrat OpenAPI Identity v1 (setup, auth, comptes, profils) | P0 | 1.5 h (S) | J1 (11-16) → J1 (11-16) | — |
| [#8](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/8) | [BACKEND] Définir le contrat OpenAPI Library — catalogue, recherche et administration | P0 | 1.5 h (S) | J1 (11-16) → J1 (11-16) | — |
| [#9](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/9) | [BACKEND] Définir le contrat OpenAPI Library — lecture, progression, favoris, accueil | P0 | 1.0 h (S) | J1 (11-16) → J1 (11-16) | — |
| [#10](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/10) | [BACKEND] Définir les conventions API communes (erreurs, pagination, versionnement) | P0 | 0.5 h (XS) | J1 (11-16) → J1 (11-16) | — |
| [#11](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/11) | [DOCS] Rédiger l'ADR identité et sécurité (JWT, refresh, profil actif, ticket de streaming, appels internes) | P0 | 1.0 h (S) | J1 (11-16) → J1 (11-16) | #10 |
| [#12](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/12) | [DOCS] Modèle de données et propriété des données par service | P0 | 1.0 h (S) | J1 (11-16) → J1 (11-16) | #11 |
| [#16](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/16) | [BACKEND] Assainir les squelettes des 3 services (config, profils, sécurité, ping interservices) | P0 | 1.5 h (S) | J1 (11-16) → J2 (11-17) | #11 |
| [#24](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/24) | [BACKEND] Définir le contrat OpenAPI Acquisition | P0 | 1.0 h (S) | J2 (11-17) → J2 (11-17) | — |
| [#25](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/25) | [BACKEND] Fournir des fixtures JSON de démonstration pour le frontend | P0 | 1.0 h (S) | J2 (11-17) → J2 (11-17) | #7, #8, #9 |
| [#27](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/27) | [BACKEND] Identity — migrations Flyway et entités JPA | P0 | 1.5 h (S) | J2 (11-17) → J3 (11-18) | #12, #16 |
| [#35](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/35) | [SECURITY] Identity — configuration Spring Security, hachage Argon2id, CORS et erreurs JSON | P0 | 1.5 h (S) | J3 (11-18) → J3 (11-18) | #27 |
| [#36](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/36) | [BACKEND] Identity — clé de signature RSA, émission JWT et endpoint JWKS | P0 | 1.5 h (S) | J3 (11-18) → J3 (11-18) | #35 |
| [#37](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/37) | [BACKEND] Identity — setup sécurisé du premier administrateur | P0 | 1.5 h (S) | J3 (11-18) → J3 (11-18) | #35 |
| [#41](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/41) | [SECURITY] Library — validation des JWT via JWKS et extraction du profil actif | P0 | 1.5 h (S) | J3 (11-18) → J4 (11-19) | #36, #16 |
| [#45](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/45) | [BACKEND] Identity — connexion et refresh token en cookie HttpOnly | P0 | 2.0 h (S) | J4 (11-19) → J4 (11-19) | #36, #37 |
| [#48](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/48) | [BACKEND] Identity — refresh rotatif, déconnexion et expiration de session | P0 | 1.5 h (S) | J4 (11-19) → J5 (11-20) | #45 |
| [#49](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/49) | [BACKEND] Library — catalogue, détails, recherche par titre, filtre par genre et nouveautés | P0 | 2.5 h (M) | J4 (11-19) → J5 (11-20) | #20 |
| [#50](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/50) | [BACKEND] Library — streaming HTTP Range (200/206/416) | P0 | 3.5 h (M) | J4 (11-19) → J5 (11-20) | #30 |
| [#51](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/51) | [SECURITY] Library — ticket de streaming signé et autorisation du flux | P0 | 1.5 h (S) | J4 (11-19) → J5 (11-20) | — |
| [#52](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/52) | [INTEGRATION] Point d'intégration J4 — première authentification, indexation, catalogue et lecture | P0 | 1.5 h (S) | J4 (11-19) → J5 (11-20) | #45, #38 |
| [#59](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/59) | [BACKEND] Identity — profils de visionnage et sélection du profil actif | P0 | 2.5 h (M) | J5 (11-20) → J5 (11-20) | #45 |
| [#62](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/62) | [BACKEND] Identity — gestion des comptes par l'administrateur | P1 | 2.5 h (M) | J5 (11-20) → J6 (11-23) | #45 |
| [#63](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/63) | [BACKEND] Library — progression de lecture par profil | P0 | 1.5 h (S) | J5 (11-20) → J6 (11-23) | #41, #49 |
| [#64](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/64) | [BACKEND] Library — favoris (« Ma liste ») par profil | P0 | 1.0 h (S) | J5 (11-20) → J6 (11-23) | #41, #49 |
| [#70](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/70) | [SECURITY] Identity — limitation des tentatives de connexion | P2 | 1.5 h (S) | J6 (11-23) → J6 (11-23) | #45 |
| [#71](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/71) | [BACKEND] Library — édition des métadonnées et suppression d'une entrée sans toucher au fichier | P1 | 1.5 h (S) | J6 (11-23) → J6 (11-23) | #49 |
| [#72](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/72) | [BACKEND] Library — endpoints internes (purge, fichier téléchargé, statut « en téléchargement ») | P1 | 1.5 h (S) | J6 (11-23) → J6 (11-23) | #16, #64 |
| [#78](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/78) | [TEST] Identity — tests d'authentification, rôles et isolation des profils | P1 | 2.5 h (M) | J6 (11-23) → J7 (11-24) | #48, #59, #62 |
| [#79](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/79) | [SECURITY] Acquisition — validation des sources, liste blanche et protection SSRF | P0 | 1.5 h (S) | J6 (11-23) → J7 (11-24) | #60 |
| [#87](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/87) | [BACKEND] Library — endpoint d'accueil (récents, catégories, favoris, continuer à regarder) | P1 | 1.5 h (S) | J7 (11-24) → J7 (11-24) | #63, #64, #49 |
| [#98](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/98) | [TEST] Library — tests Range, autorisations et isolation des profils | P1 | 2.5 h (M) | J7 (11-24) → J7 (11-24) | #50, #51, #63, #64 |
| [#88](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/88) | [BACKEND] Acquisition — rappel des droits et démarrage/statut/annulation des téléchargements | P0 | 2.5 h (M) | J7 (11-24) → J7 (11-24) | #60, #74, #79, #41 |
| [#109](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/109) | [DOCS] Documenter les contrats interservices et la sécurité des API internes | P1 | 1.5 h (S) | J7 (11-24) → J7 (11-24) | #72 |
| [#97](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/97) | [BACKEND] Identity — suppression de compte et purge des données associées | P1 | 1.5 h (S) | J7 (11-24) → J8 (11-25) | #59, #72 |
| [#99](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/99) | [BACKEND] Acquisition — synchronisation des états et transmission du fichier terminé à Library | P0 | 2.0 h (S) | J7 (11-24) → J8 (11-25) | #88, #72 |
| [#106](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/106) | [BACKEND] Acquisition — gestion des pannes et messages d'erreur compréhensibles | P1 | 1.0 h (S) | J7 (11-24) → J8 (11-25) | #99 |
| [#113](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/113) | [SECURITY] Lancer la revue de l'agent IA et vérifier chaque constat | P1 | 2.0 h (S) | J7 (11-24) → J8 (11-25) | #17, #108 |
| [#107](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/107) | [TEST] Acquisition — tests des règles métier et de sécurité | P1 | 1.5 h (S) | J8 (11-25) → J8 (11-25) | #88, #99 |
| [#108](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/108) | [TEST] Vérifier la conformité OpenAPI ↔ implémentation (springdoc + tests de contrat) | P1 | 1.5 h (S) | J8 (11-25) → J8 (11-25) | #78, #98, #107 |
| [#114](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/114) | [BACKEND] Corriger les défauts de sécurité et d'intégration remontés (J8–J9) | P0 | 2.5 h (M) | J8 (11-25) → J8 (11-25) | #113, #82 |
| [#121](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/121) | [DOCS] Préparer les slides — architecture, microservices et sécurité (section backend) | P1 | 1.5 h (S) | J9 (11-26) → J9 (11-26) | #92 |
| [#122](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/122) | [DOCS] Enregistrer la partie technique de la vidéo de démonstration | P1 | 1.5 h (S) | J9 (11-26) → J9 (11-26) | #92 |
| [#128](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/128) | [DOCS] Présentation finale — Présenter l'architecture, la sécurité et le backend, et répondre aux questions | P0 | 2 h (S) | J10 (11-27) → J10 (11-27) | #125 |

### Haitu

| # | Titre | Prio | Estim. | Début → Fin | Dépend de |
|---|---|---|---|---|---|
| [#1](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/1) | [DEVOPS] Auditer l'environnement et figer l'architecture d'infrastructure (ADR) | P0 | 1.5 h (S) | J1 (11-16) → J1 (11-16) | — |
| [#2](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/2) | [DEVOPS] Définir conventions Git, templates et protections de branche | P0 | 1.5 h (S) | J1 (11-16) → J1 (11-16) | — |
| [#3](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/3) | [DOCS] Rédiger le working agreement et la routine d'équipe | P0 | 1.0 h (S) | J1 (11-16) → J1 (11-16) | — |
| [#4](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/4) | [DOCS] Constituer le registre des risques | P1 | 1.0 h (S) | J1 (11-16) → J1 (11-16) | — |
| [#13](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/13) | [DEVOPS] Écrire les Dockerfiles multi-stage des 3 services Spring Boot et du frontend | P0 | 3.0 h (M) | J1 (11-16) → J2 (11-17) | #1 |
| [#14](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/14) | [DOCS] Préparer et documenter le média de démonstration (MP4 H.264/AAC) et ses licences | P0 | 1.5 h (S) | J1 (11-16) → J2 (11-17) | — |
| [#17](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/17) | [DOCS] Définir le rôle de l'agent IA « API & Security Consistency Reviewer » | P1 | 1.0 h (S) | J2 (11-17) → J2 (11-17) | #3 |
| [#18](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/18) | [DEVOPS] Créer compose.yaml avec réseau, bases PostgreSQL séparées et démarrage contrôlé | P0 | 2.5 h (M) | J2 (11-17) → J2 (11-17) | #13 |
| [#19](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/19) | [INTEGRATION] Point d'intégration J2 — services démarrables et communication interservices | P0 | 1.0 h (S) | J2 (11-17) → J2 (11-17) | #18, #16 |
| [#20](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/20) | [BACKEND] Library — migrations Flyway et entités JPA du catalogue | P0 | 2.5 h (M) | J2 (11-17) → J2 (11-17) | #12 |
| [#28](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/28) | [DEVOPS] Gérer les variables d'environnement, `.env.example` et la génération des secrets | P0 | 1.5 h (S) | J3 (11-18) → J3 (11-18) | #18 |
| [#29](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/29) | [DEVOPS] Mettre en place la CI GitHub Actions (build, tests, lint, scan de secrets) | P0 | 2.5 h (M) | J3 (11-18) → J3 (11-18) | #2 |
| [#30](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/30) | [SECURITY] Library — dossiers autorisés et résolution de chemin sécurisée (anti path traversal) | P0 | 3.0 h (M) | J3 (11-18) → J3 (11-18) | #20 |
| [#38](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/38) | [BACKEND] Library — détection des vidéos et indexation manuelle idempotente | P0 | 3.5 h (M) | J3 (11-18) → J4 (11-19) | #30 |
| [#42](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/42) | [DEVOPS] Volumes persistants, montage médias en lecture seule et dossier de téléchargement dédié | P0 | 2.0 h (S) | J4 (11-19) → J4 (11-19) | #18 |
| [#46](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/46) | [DOCS] Établir les preuves de licence du fichier P2P de démonstration | P0 | 1.5 h (S) | J4 (11-19) → J5 (11-20) | #14 |
| [#54](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/54) | [SECURITY] En-têtes de sécurité, CORS et CSP du reverse proxy | P1 | 1.5 h (S) | J5 (11-20) → J5 (11-20) | #13 |
| [#55](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/55) | [INTEGRATION] Revue de mi-parcours J5 — parcours principal et réduction de périmètre | P0 | 1.5 h (S) | J5 (11-20) → J5 (11-20) | #45, #38 |
| [#60](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/60) | [BACKEND] Acquisition — migrations, entités et catalogue de contenus autorisés (+ seed) | P0 | 2.5 h (M) | J5 (11-20) → J6 (11-23) | #12, #24, #14 |
| [#61](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/61) | [DEVOPS] Isoler le client BitTorrent (Transmission) dans Docker Compose | P0 | 2.0 h (S) | J5 (11-20) → J6 (11-23) | #42, #46 |
| [#75](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/75) | [DEVOPS] Scripts de sauvegarde et de restauration des données persistantes | P1 | 2.5 h (M) | J5 (11-20) → J6 (11-23) | #42 |
| [#92](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/92) | [DOCS] Documentation technique — architecture, services, données et choix | P1 | 1.5 h (S) | J5 (11-20) → J7 (11-24) | #12, #11, #1 |
| [#73](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/73) | [BACKEND] Library — disponibilité, fichiers supprimés et doublons | P1 | 1.5 h (S) | J6 (11-23) → J7 (11-24) | #38 |
| [#74](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/74) | [BACKEND] Acquisition — adaptateur du client BitTorrent (Transmission RPC) | P0 | 3.0 h (M) | J6 (11-23) → J7 (11-24) | #60, #61 |
| [#89](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/89) | [TEST] Tests de démarrage et de persistance automatisés | P1 | 1.5 h (S) | J6 (11-23) → J7 (11-24) | #45 |
| [#81](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/81) | [SECURITY] Statut des services — agrégateur de santé pour l'administration | P1 | 1.5 h (S) | J7 (11-24) → J7 (11-24) | #16, #18 |
| [#82](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/82) | [INTEGRATION] Point d'intégration J7 — profils, progression, favoris, administration, acquisition | P0 | 1.5 h (S) | J7 (11-24) → J7 (11-24) | #59, #63, #64, #88 |
| [#100](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/100) | [DOCS] Guide de sauvegarde/restauration et note de sensibilisation au droit d'auteur et au P2P | P1 | 1.5 h (S) | J7 (11-24) → J7 (11-24) | #75, #46 |
| [#90](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/90) | [SECURITY] Audit des montages, permissions, réseau et images | P1 | 2.0 h (S) | J7 (11-24) → J8 (11-25) | #61, #75 |
| [#91](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/91) | [DOCS] README utilisateur — installation, configuration, accès et première lecture | P0 | 2.5 h (M) | J7 (11-24) → J8 (11-25) | #28, #42 |
| [#93](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/93) | [DEVOPS] Environnement de démonstration, comptes de démo et script de réinitialisation | P1 | 1.5 h (S) | J7 (11-24) → J8 (11-25) | #14, #91 |
| [#111](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/111) | [INTEGRATION] Test de transfert P2P réel de bout en bout | P0 | 2.0 h (S) | J8 (11-25) → J8 (11-25) | #99, #74, #95, #61 |
| [#112](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/112) | [TEST] Installation sur environnement vierge en suivant uniquement le README | P0 | 2.5 h (M) | J8 (11-25) → J8 (11-25) | #91, #93 |
| [#115](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/115) | [TEST] Plan d'acceptation et exécution des 10 scénarios MVP | P0 | 3.5 h (M) | J8 (11-25) → J8 (11-25) | #111, #112, #82 |
| [#110](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/110) | [TEST] Tests E2E Playwright du parcours principal | P3 | 3.5 h (M) | J8 (11-25) → J9 (11-26) | #53, #83, #18 |
| [#116](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/116) | [DOCS] Dépannage, limites connues et environnements testés | P1 | 1.5 h (S) | J9 (11-26) → J9 (11-26) | #112 |
| [#123](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/123) | [DOCS] Préparer les slides — infrastructure, sécurité et choix techniques + assemblage du deck | P1 | 1.5 h (S) | J9 (11-26) → J9 (11-26) | #115 |
| [#124](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/124) | [DOCS] Montage et publication de la vidéo de démonstration (2 à 6 minutes) | P1 | 2.5 h (M) | J9 (11-26) → J9 (11-26) | #119, #122 |
| [#125](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/125) | [DOCS] Répétition générale chronométrée et plan B de la démonstration | P1 | 1.5 h (S) | J9 (11-26) → J9 (11-26) | #123, #115 |
| [#126](https://github.com/tomvieilledent/holbertonschool-homeflix-project/issues/126) | [DOCS] Présentation finale — Présenter l'infrastructure, le P2P et la livraison, et répondre aux questions | P0 | 2 h (S) | J10 (11-27) → J10 (11-27) | #125 |

## 6. Risques principaux

1. **Surcharge** : ≈ 197 h de développement planifiées (J1–J8) pour 192 h de capacité : dépassement d'environ 3 %, aucune marge. Première variable d'ajustement : les issues P2/P3 (E2E Playwright, anti brute-force, onboarding, page d'état), puis la doc d'architecture détaillée.
2. **Fichier P2P** : un fichier libre de droits *avec des pairs actifs* doit être validé dès J4 (issue de licence). Plan B : seed local sur une seconde machine.
3. **Streaming authentifié** : `<video>` n'envoie pas d'en-tête `Authorization` → ticket de streaming signé (ADR à confirmer J1).
4. **Squelette incohérent** : Library/Acquisition sans datasource, sécurité par défaut bloquante (corrigé par l'issue d'assainissement du squelette).
5. **Versions très récentes** (Spring Boot 4, Vite 8, React 19) : risque de documentation/compatibilité des bibliothèques.
6. **Client BitTorrent en conteneur** : ports de pairs, droits UID/GID sur le volume `downloads`, image `latest` à épingler.
7. **Montages NAS** : comportement des droits et du read-only selon l'environnement ; limiter les environnements « supportés ».

## 7. Fonctionnalités

- **Obligatoires (P0/P1)** : setup admin, auth/refresh/logout, comptes et rôles, profils, indexation, catalogue/recherche/genres, streaming Range, progression, favoris, administration, acquisition P2P réelle, Docker Compose, doc, tests, acceptation, agent IA, vidéo.
- **Facultatives (P2/P3)** : anti brute-force, état des services (P2), E2E Playwright, onboarding guidé.

## 8. Décisions techniques à confirmer (J1)

1. JWT RS256 + JWKS, refresh en cookie HttpOnly, claim `pid`, ticket de streaming (ADR de l'issue « ADR identité et sécurité »).
2. Frontend appelle `/api/identity/v1/…`, `/api/library/v1/…`, `/api/acquisition/v1/…` (réécriture nginx).
3. Client BitTorrent : Transmission (RPC) plutôt que qBittorrent.
4. Soft delete des entrées de catalogue pour éviter une réindexation involontaire.
5. Bibliothèques frontend : React Router, MSW (mocks), Vitest + Testing Library, Playwright (optionnel).
6. Tests backend : Testcontainers PostgreSQL (dépendance à ajouter).

## 9. Déjà réalisé (aucune issue créée)

- Squelettes Spring Boot des trois services et du frontend Vite/React.
- Conversion du frontend de TypeScript vers JavaScript.
- `compose.yaml`, Dockerfiles, nginx, `.env.example`, init des bases, `scripts/gen-env.sh` (démarrage de la stack validé localement) : les issues Docker correspondantes servent à les durcir/compléter, pas à les recréer.

## 10. Critères de validation

Les 10 scénarios d'acceptation du sujet sont exécutés et documentés dans `docs/ACCEPTANCE_REPORT.md` ; installation depuis le README sur machine vierge ; transfert P2P réel ; rapport de l'agent IA avec décisions humaines.
