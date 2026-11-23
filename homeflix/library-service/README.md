# library-service

Catalogue, recherche, lecture par plages d'octets (tickets signés), favoris, progression, indexation et API interne. Contrat : [`docs/api/library.openapi.yaml`](../../docs/api/library.openapi.yaml).

## Tests

Docker doit tourner (Testcontainers démarre un PostgreSQL 17 réel).

```bash
./mvnw test      # tous les tests
./mvnw verify    # idem, comme la CI
```

- Lecture par plages d'octets (206, 416, suffixe, fin hors fichier) : `playback/StreamApiIntegrationTests`.
- Lecture sans ticket valide, média retiré ou indisponible : `playback/StreamAccessFlowIntegrationTests`.
- Isolation entre profils et entre comptes : `viewing/FavouriteApiIntegrationTests`, `viewing/ProgressApiIntegrationTests`, `viewing/AccountIsolationIntegrationTests`.
- Persistance (redémarrage du service sur la même base, migrations non rejouées) : `media/RestartPersistenceIntegrationTests`.
