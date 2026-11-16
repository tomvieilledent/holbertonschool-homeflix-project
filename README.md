# Homeflix

Projet Holberton School : plateforme de streaming personnelle en architecture microservices.

## Architecture

| Module | Rôle | Stack | Port |
|---|---|---|---|
| `homeflix/identity-service` | Authentification et utilisateurs | Spring Boot 4.1, Java 21, PostgreSQL, Flyway | 8081 |
| `homeflix/library-service` | Catalogue / bibliothèque de médias | Spring Boot 4.1, Java 21, PostgreSQL, Flyway | - |
| `homeflix/acquisition-service` | Acquisition de médias | Spring Boot 4.1, Java 21, PostgreSQL, Flyway | - |
| `homeflix/frontend` | Interface web | React 19, Vite, TypeScript | 5173 |

## Prérequis

- Java 21, Maven (wrapper `./mvnw` fourni)
- Node.js 24+
- PostgreSQL

## Lancer un service

```bash
export DB_URL=jdbc:postgresql://localhost:5432/homeflix_identity DB_USER=... DB_PASSWORD=...
cd homeflix/identity-service && ./mvnw spring-boot:run
```

## Frontend

```bash
cd homeflix/frontend && npm install && npm run dev
```

## Conventions

- Commits : [Conventional Commits](https://www.conventionalcommits.org/) (`feat(identity): ...`).
- Branches : `feat/<sujet>`, `fix/<sujet>`, PR vers `main`.
