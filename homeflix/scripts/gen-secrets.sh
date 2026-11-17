#!/bin/bash
# Crée .env à partir de .env.example avec des secrets aléatoires, ou complète un .env existant.
#
#   ./scripts/gen-secrets.sh
#
# - Chaque ligne « NOM=CHANGE_ME » reçoit un secret adapté à son rôle.
# - Les autres lignes de .env.example sont copiées telles quelles.
# - Un .env existant n'est JAMAIS modifié : seules les variables qui lui manquent sont ajoutées.
# - Le fichier .env est créé avec les droits 600 et ignoré par Git. Les secrets ne sont jamais
#   affichés.
# Prérequis : openssl.
set -euo pipefail
cd "$(dirname "$0")/.."

command -v openssl >/dev/null || { echo "openssl est requis." >&2; exit 1; }
[ -f .env.example ] || { echo ".env.example introuvable." >&2; exit 1; }

hex() { openssl rand -hex "$1"; }

generate() { # nom de la variable -> valeur secrète sur une ligne
  case "$1" in
    JWT_PRIVATE_KEY_BASE64)
      openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 2>/dev/null | openssl base64 -A ;;
    INTERNAL_API_KEY|STREAM_TICKET_SECRET) hex 32 ;;
    *) hex 24 ;;
  esac
}

created=false
if [ ! -f .env ]; then
  : > .env
  chmod 600 .env
  created=true
fi
chmod 600 .env

added=()
while IFS= read -r line; do
  # Ligne de variable : NOM=valeur (les commentaires et lignes vides sont ignorés)
  if [[ "$line" =~ ^([A-Z][A-Z0-9_]*)=(.*)$ ]]; then
    name="${BASH_REMATCH[1]}"; value="${BASH_REMATCH[2]}"
    grep -q "^${name}=" .env && continue          # déjà présente : on ne touche à rien
    if [ "$value" = "CHANGE_ME" ]; then value="$(generate "$name")"; fi
    printf '%s=%s\n' "$name" "$value" >> .env
    added+=("$name")
  fi
done < .env.example

if [ "${#added[@]}" -eq 0 ]; then
  echo ".env est déjà complet, rien n'a été modifié."
else
  $created && echo ".env créé (droits 600)." || echo ".env complété (droits 600)."
  printf 'Variables ajoutées : %s\n' "${added[*]}"
  echo "Ne committez jamais .env ; il est ignoré par Git."
fi
