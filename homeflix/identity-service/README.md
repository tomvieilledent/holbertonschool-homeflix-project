# identity-service

Comptes, connexion, jetons JWT (RS256 + JWKS), profils et administration des comptes. Contrat : [`docs/api/identity.openapi.yaml`](../../docs/api/identity.openapi.yaml).

## Tests

Docker doit tourner (Testcontainers démarre un PostgreSQL 17 réel).

```bash
./mvnw test      # tous les tests
./mvnw verify    # tests + rapport de couverture + contrôle des 70 %
```

- Rapport de couverture : `target/site/jacoco/index.html`.
- `verify` échoue si la couverture des lignes passe sous **70 %** dans les paquets `auth` et `security`.
- Scénarios d'autorisation (anonyme, USER, ADMIN, jeton expiré, falsifié, `alg=none`, accès aux données d'un autre compte) : `security/AuthorizationScenariosIntegrationTests`.
