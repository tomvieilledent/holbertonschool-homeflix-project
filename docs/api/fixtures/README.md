# Fixtures JSON de démonstration

Réponses réalistes des contrats `identity.openapi.yaml` et `library.openapi.yaml`, pour le mock API du frontend (MSW) et les tests.

| Dossier | Contenu |
|---|---|
| `library/` | 12 films (9 disponibles, 2 indisponibles, 1 en téléchargement), détail, genres, accueil (plein et vide), reprise de lecture, favoris, progression (`NOT_STARTED`, `STARTED`, `COMPLETED`), ticket de streaming, indexation, dossiers autorisés |
| `identity/` | statut du setup, jeton, compte courant (avec et sans profil actif), 3 profils (Alice, Bruno, Enfants), 3 comptes |
| `errors/` | un `problem+json` par code métier de `CONVENTIONS.md` (24 codes) |

- Les titres sont des courts métrages libres de la Blender Foundation (CC BY, voir `docs/legal/DEMO_MEDIA.md`) ; les descriptions sont rédigées pour le projet. `posterUrl` vaut `/posters/<titre>.jpg` (images à fournir par le frontend) ou `null` pour tester l'affiche de remplacement.
- Les jetons et mots de passe sont factices.
- Les fixtures d'Acquisition seront ajoutées avec son contrat.

## Validation

```bash
pip install pyyaml jsonschema
python3 docs/api/fixtures/validate.py
```

Le script valide chaque fichier contre son schéma OpenAPI, vérifie que chaque code d'erreur et son statut figurent dans `CONVENTIONS.md`, que chaque média cité existe dans le catalogue, et qu'aucun fichier n'est sans règle de validation. Il échoue (code 1) à la moindre erreur.
