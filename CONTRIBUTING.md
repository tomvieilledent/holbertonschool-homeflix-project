# Guide de contribution

Trois personnes travaillent en parallèle sur ce dépôt. Ces règles évitent les conflits et les régressions ; elles s'appliquent à tout le monde, y compris aux changements de documentation.

## Principe général

1. **Une issue = une branche = une pull request.**
2. **Personne ne pousse directement sur `main`** : tout passe par une PR relue.
3. **Une PR est petite** : si elle dépasse une demi-journée de travail, elle se découpe.
4. **Rien n'est fusionné sans relecture** d'une autre personne que l'auteur.

## Branches

- Depuis l'issue, utiliser **Create a branch** (le nom `N-titre-de-l-issue` est accepté tel quel), ou créer une branche nommée `<type>/<numéro>-<sujet-court>` :

| Préfixe | Usage |
|---|---|
| `feat/` | nouvelle fonctionnalité |
| `fix/` | correction d'un défaut |
| `docs/` | documentation, ADR, contrats d'API |
| `chore/` | outillage, configuration, dépendances |
| `test/` | tests seuls |

- Exemple : `feat/38-indexation-idempotente`.
- Partir toujours de `main` à jour (`git checkout main && git pull`).
- Supprimer la branche après la fusion.

## Commits

Format [Conventional Commits](https://www.conventionalcommits.org/) :

```
<type>(<portée>): <description courte à l'impératif>
```

- **Types** : `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`.
- **Portées usuelles** : `identity`, `library`, `acquisition`, `frontend`, `infra`, `api`, `adr`, `architecture`.
- Une ligne de moins de 72 caractères, sans point final. Le corps du message (facultatif) explique le *pourquoi*.
- Exemples : `feat(library): add idempotent manual indexing`, `fix(identity): reject disabled accounts at refresh`, `docs(infra): add ADR 0002`.
- Un commit = un changement cohérent qui compile et passe les tests.
- La langue (français ou anglais) est libre ; rester cohérent dans une même PR.

## Pull requests

1. Pousser la branche, ouvrir une PR vers `main`.
2. **Remplir le modèle de PR** : lien d'issue (`Closes #N`), résumé, tests, captures si l'interface change.
3. Demander la relecture des deux autres personnes ; au moins **une approbation** est requise.
4. **Ne pas pousser de nouveau commit après une approbation** sans le dire : le dernier à avoir poussé ne peut pas approuver, et l'approbation précédente peut tomber. Pour corriger après une remarque, répondre dans la PR puis redemander une relecture.
5. Ne jamais approuver une PR dont on est l'auteur ou le dernier à avoir poussé.
6. La fusion se fait quand la CI est verte (une fois la CI en place, voir l'issue #29) et que les conflits sont résolus. **L'auteur fusionne**, sauf accord contraire.
7. Une PR qui change un contrat d'API met à jour le fichier OpenAPI correspondant dans `docs/api/` dans la même PR.

## Relecture

La personne qui relit vérifie, dans cet ordre :

1. **Le but** : la PR fait ce que dit l'issue et ses critères d'acceptation.
2. **La sécurité** : pas de secret committé, validation côté serveur, autorisation vérifiée, pas de chemin ni d'URL fournis par l'utilisateur sans contrôle.
3. **Les tests** : les cas importants et les cas d'erreur sont couverts.
4. **La lisibilité** : noms clairs, pas de code mort.
5. **La documentation** : README, ADR ou contrat d'API à jour si nécessaire.

Une remarque bloquante se pose avec « Request changes » ; une simple suggestion avec « Comment ».

## Définition de « terminé »

Une issue est terminée quand : les critères d'acceptation sont remplis, les tests passent, la PR est relue et fusionnée, et la documentation concernée est à jour.

## Secrets

- Ne jamais committer de secret : `.env` est ignoré par Git, seul `.env.example` (valeurs `CHANGE_ME`) est versionné.
- Un secret committé par erreur est considéré comme compromis : prévenir l'équipe et le **changer**, ne pas se contenter de le supprimer du dépôt.

## Propriétaires du code

Le fichier [`.github/CODEOWNERS`](.github/CODEOWNERS) désigne le propriétaire de chaque zone : le frontend (Jason), les services Spring Boot (Tom), l'infrastructure et la CI (Haitu). Le propriétaire est automatiquement proposé comme relecteur des PR qui touchent sa zone.
