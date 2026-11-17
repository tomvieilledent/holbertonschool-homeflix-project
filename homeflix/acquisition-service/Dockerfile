# syntax=docker/dockerfile:1
ARG JAVA_VERSION=21

# --- Étape 1 : compilation (Maven wrapper, dépendances mises en cache) ---
FROM eclipse-temurin:${JAVA_VERSION}-jdk AS build
WORKDIR /app
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw -q -B dependency:go-offline
COPY src src
RUN ./mvnw -q -B -DskipTests package

# --- Étape 2 : exécution (JRE seul, utilisateur non root) ---
FROM eclipse-temurin:${JAVA_VERSION}-jre
RUN groupadd --system app && useradd --system --gid app --no-create-home app
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
USER app

# Port d'écoute par défaut ; compose peut le surcharger avec SERVER_PORT.
ARG SERVER_PORT=8083
ENV SERVER_PORT=${SERVER_PORT}
EXPOSE 8083

# /actuator/health est public (SecurityConfig). curl est présent dans l'image eclipse-temurin.
HEALTHCHECK --interval=10s --timeout=3s --start-period=40s --retries=12 \
  CMD curl -fsS -o /dev/null http://127.0.0.1:${SERVER_PORT}/actuator/health

ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
