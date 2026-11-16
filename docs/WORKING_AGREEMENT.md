# Working agreement — HomeFlix

Accord d'équipe pour le projet HomeFlix (2 semaines, du 16 au 27 novembre 2026). Il est valable pour les trois membres et se révise en équipe : toute modification passe par une PR relue, comme le reste du dépôt.

## 1. Équipe et rôles

| Membre | Compte GitHub | Rôle principal | Zone du code (voir `.github/CODEOWNERS`) |
|---|---|---|---|
| Jason | `ToujoursPareil8` | Frontend et expérience utilisateur | `homeflix/frontend/` |
| Tom | `tomvieilledent` | Backend : services Spring Boot, contrats d'API | `homeflix/*-service/`, `docs/api/`, `docs/architecture/` |
| Haitu | `N-Haitu31` | DevOps : Docker, CI, infrastructure, livraison, recette | `homeflix/compose.yaml`, `.github/`, `homeflix/initdb/`, `homeflix/scripts/`, Dockerfiles, nginx |

Chacun est **responsable de sa zone** (qualité, relecture, documentation) mais **tous les trois contribuent au développement** et doivent pouvoir expliquer l'architecture complète et leur propre travail à l'oral. Les rôles peuvent évoluer selon la charge ; tout changement est noté dans la section 9.

Chaque membre présente sa partie lors de la soutenance du 27 novembre (issues #126, #127, #128).

## 2. Disponibilités

- Développement : du lundi 16 au mercredi 25 novembre, de 8 h à 17 h.
- Jeudi 26 novembre : acceptation finale, préparation de la présentation.
- Vendredi 27 novembre : présentation et démonstration.
- Une absence ou un retard se signale à l'équipe dès que possible, avec les tickets concernés.

## 3. Communication et routine

### Daily (10 minutes, chaque jour de développement)
- **Heure** : 9 h 00.
- **Format** : debout, 3 questions chacun : ce que j'ai terminé, ce que je fais aujourd'hui, ce qui me bloque.
- Pas de discussion technique longue pendant le daily : si un sujet demande du temps, il se traite juste après, entre les personnes concernées.

### Outils
- **Issues et GitHub Project** : source de vérité pour qui fait quoi et l'état d'avancement. Le statut d'une carte reflète la réalité (« En cours » quand on commence, « Terminé » à la fusion de la PR).
- **Pull requests** : lieu des décisions sur le code (voir `CONTRIBUTING.md`).
- **Discussions rapides** : Discord (serveur de l'équipe). Les décisions importantes prises sur Discord sont reportées dans la PR ou l'issue concernée, pour rester traçables.

## 4. Règles de travail

Les règles de branches, de commits et de PR sont dans [`CONTRIBUTING.md`](../CONTRIBUTING.md). En résumé :

- une issue = une branche = une PR, petite, reliée par `Closes #N` ;
- aucun push direct sur `main` ;
- chaque PR est relue par au moins une autre personne que l'auteur ;
- l'auteur fusionne, après approbation et CI verte ;
- aucun secret dans le dépôt.

### Règles de revue
- **Délai de réponse** : une demande de relecture reçoit une réponse dans la demi-journée ouvrée. Une PR qui bloque quelqu'un se relit en priorité.
- **Contenu** : la relecture vérifie dans l'ordre le but, la sécurité, les tests, la lisibilité et la documentation.
- **Ton** : on critique le code, pas la personne ; une remarque bloquante se justifie.
- **Dernier à pousser** : la personne qui a poussé le dernier commit d'une PR ne peut pas l'approuver.

## 5. Définition de « terminé » (Done)

Une issue est terminée quand **toutes** les conditions suivantes sont remplies :

1. Les critères d'acceptation de l'issue sont satisfaits.
2. Les tests prévus passent (en local et, une fois la CI en place, dans la CI).
3. La PR est relue, approuvée et fusionnée dans `main`.
4. La documentation concernée est à jour (README, ADR, contrat OpenAPI).
5. Aucun secret ni donnée personnelle n'a été committé.
6. La carte du Project est passée à « Terminé » et l'issue est fermée.

Une fonctionnalité n'est pas « terminée » si elle ne marche que sur la machine de son auteur : elle doit démarrer avec `docker compose up --build`.

## 6. Points d'intégration

Des points d'intégration jalonnent le planning ; chacun vérifie que les morceaux écrits séparément fonctionnent ensemble. Le détail et les dates se trouvent dans [`PROJECT_EXECUTION_PLAN.md`](PROJECT_EXECUTION_PLAN.md).

| Jour | Date | Objectif du point | Responsable du point |
|---|---|---|---|
| J2 | 17/11 | Services démarrables avec Docker Compose, communication Library → Identity démontrée | Haitu |
| J4 | 19/11 | Première chaîne complète : authentification, indexation, catalogue, lecture | Tom |
| J5 | 20/11 | Revue de mi-parcours : parcours principal vérifié, **réduction de périmètre si nécessaire** | Haitu |
| J7 | 24/11 | Profils, progression, favoris, administration, acquisition intégrés | Haitu |
| J8 | 25/11 | Fonctionnalités obligatoires terminées | toute l'équipe |
| J9 | 26/11 | Acceptation, installation sur machine vierge, **gel du périmètre** | Haitu |

À chaque point, l'équipe se réunit, exécute le parcours concerné **sur une installation propre** et note les écarts. Les défauts bloquants deviennent des issues prioritaires (P0).

## 7. Gestion des blocages et de la charge

- **Bloqué plus de 30 minutes** : on le dit tout de suite à l'équipe (ne pas attendre le daily).
- **Entraide** : elle se fait en équipe, selon la partie qui concerne le problème. La personne dont c'est la zone est sollicitée en premier (voir section 1) ; les deux autres aident à diagnostiquer. Ce principe de partage de connaissance est volontaire : chacun doit comprendre tout le projet.
- **Dépendances entre issues** : si une issue dépend du travail de quelqu'un d'autre, on s'accorde sur un contrat (OpenAPI, fixtures) pour pouvoir avancer en parallèle plutôt qu'attendre.
- **Surcharge** : le plan est tendu (charge proche de 100 % de la capacité). Si un retard apparaît, on réduit le périmètre en commençant par les issues P2 et P3 (tests E2E, limitation des tentatives de connexion, onboarding, page d'état des services), jamais par les tests, la sécurité ni la documentation de livraison. La décision se prend au point d'intégration J5 et se note ici.
- **Conflits d'avis techniques** : on tranche par une ADR courte (`docs/adr/`) ou, à défaut, à la majorité après discussion.

## 8. Agent IA

> **Section à compléter dans l'issue #17** (rôle de l'agent IA « API & Security Consistency Reviewer »). Elle doit contenir les éléments suivants, exigés par le sujet.

| Élément | Contenu |
|---|---|
| Objectif | _à définir (#17)_ |
| Entrées nommées | _à définir (#17)_ |
| Outils autorisés | _à définir (#17)_ |
| Limites explicites | _à définir (#17)_ : ni secrets, ni modification de l'authentification, ni média, ni téléchargement, ni fusion, ni déploiement |
| Livrables | _à définir (#17)_ : rapport avec fichier et ligne, gravité, preuve de reproduction, correction suggérée |
| Apprenant superviseur | _à désigner (#17)_ |
| Revue humaine | Un apprenant vérifie chaque constat et approuve tout changement avant fusion (issue #113) |
| Attribution | _à définir (#17)_ |

Séparément de ce rôle délégué, l'équipe peut utiliser des assistants IA pour développer, à condition que chacun relise, comprenne et assume le code proposé. Le dernier mot appartient toujours à l'humain qui ouvre la PR.

## 9. Historique des modifications

| Date | Modification | Par |
|---|---|---|
| 2026-11-16 | Création du document | Haitu |
