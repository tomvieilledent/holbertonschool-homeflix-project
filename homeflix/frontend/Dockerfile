# syntax=docker/dockerfile:1
ARG NODE_VERSION=24
ARG NGINX_VERSION=1.31

# --- Étape 1 : build Vite ---
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Étape 2 : nginx sans privilèges (utilisateur non root, port 8080) ---
FROM nginxinc/nginx-unprivileged:${NGINX_VERSION}-alpine
# Applique les correctifs de sécurité des paquets Alpine publiés depuis la construction de l'image de base (audit :
# docs/SECURITY_AUDIT.md), puis redonne la main à l'utilisateur sans privilèges de l'image (nginx, UID 101).
USER root
RUN apk upgrade --no-cache
USER 101
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=6 \
  CMD ["wget", "-q", "--spider", "http://127.0.0.1:8080/"]
