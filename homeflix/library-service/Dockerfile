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
ARG SERVER_PORT=8082
ENV SERVER_PORT=${SERVER_PORT}
EXPOSE 8082

# Test TCP en attendant que /actuator/health soit ouvert par la configuration
# Spring Security (issue #16). À remplacer ensuite par un appel HTTP.
HEALTHCHECK --interval=10s --timeout=3s --start-period=40s --retries=12 \
  CMD ["bash", "-c", "exec 3<>/dev/tcp/127.0.0.1/${SERVER_PORT}"]

ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
