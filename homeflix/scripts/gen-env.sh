#!/bin/bash
# Génère .env depuis .env.example avec des secrets aléatoires. Refuse d'écraser un .env existant.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -e .env ] && { echo ".env existe déjà, rien modifié." >&2; exit 1; }
while IFS= read -r line; do
  echo "${line//CHANGE_ME/$(openssl rand -hex 24)}"
done < .env.example > .env
chmod 600 .env && echo ".env créé."
