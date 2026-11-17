#!/bin/bash
# Test de fumée de la pile HomeFlix : démarre, vérifie la santé, l'isolation réseau et
# l'isolation des bases, puis arrête.
#
#   ./scripts/smoke.sh            # démarre, vérifie, arrête (les volumes sont conservés)
#   KEEP_UP=1 ./scripts/smoke.sh  # laisse la pile démarrée
#
# Prérequis : Docker Compose, curl, un fichier .env (créé ou complété par ./scripts/gen-secrets.sh).
set -uo pipefail
cd "$(dirname "$0")/.."

FRONTEND_PORT="${FRONTEND_PORT:-8080}"
fails=0
pass() { printf '  [OK]   %s\n' "$1"; }
fail() { printf '  [FAIL] %s\n' "$1"; fails=$((fails + 1)); }
check() { if eval "$2" > /dev/null 2>&1; then pass "$1"; else fail "$1"; fi; }

./scripts/gen-secrets.sh || exit 1   # crée .env ou ajoute les variables manquantes
set -a; . ./.env; set +a
FRONTEND_PORT="${FRONTEND_PORT:-8080}"

echo "== Démarrage (docker compose up --build --wait)"
if ! docker compose up --build -d --wait --wait-timeout 420; then
  fail "la pile démarre jusqu'à l'état healthy"
  docker compose ps
  exit 1
fi
pass "la pile démarre jusqu'à l'état healthy"

echo "== Services"
for svc in db identity-service library-service acquisition-service transmission frontend; do
  state=$(docker compose ps --format '{{.Health}}' "$svc" 2>/dev/null)
  [ "$state" = "healthy" ] && pass "$svc est healthy" || fail "$svc n'est pas healthy (état : ${state:-inconnu})"
done

echo "== Accès depuis l'hôte"
base="http://localhost:${FRONTEND_PORT}"
check "le frontend répond 200" "[ \"\$(curl -s -o /dev/null -w '%{http_code}' $base/)\" = 200 ]"
check "une route SPA inconnue répond 200" "[ \"\$(curl -s -o /dev/null -w '%{http_code}' $base/catalogue)\" = 200 ]"
check "/api/*/internal est refusé (404)" "[ \"\$(curl -s -o /dev/null -w '%{http_code}' $base/api/library/internal/x)\" = 404 ]"
check "/api/*/actuator est refusé (404)" "[ \"\$(curl -s -o /dev/null -w '%{http_code}' $base/api/identity/actuator/health)\" = 404 ]"
check "une API protégée sans jeton répond 401" "[ \"\$(curl -s -o /dev/null -w '%{http_code}' $base/api/identity/v1/x)\" = 401 ]"

echo "== Ports publiés (seul le frontend doit l'être)"
# On lit les ports publiés directement dans docker inspect (indépendant de la version de Compose).
published=""
for id in $(docker compose ps -q); do
  hostports=$(docker inspect -f '{{range $p, $b := .NetworkSettings.Ports}}{{if $b}}x{{end}}{{end}}' "$id")
  if [ -n "$hostports" ]; then
    published+="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' "$id") "
  fi
done
published=$(echo "$published" | tr ' ' '\n' | grep -v '^$' | sort -u | tr '\n' ' ')
[ "$published" = "frontend " ] && pass "seul le frontend publie un port" || fail "services qui publient un port : ${published:-aucun}"

echo "== Isolation des bases"
psql_as() { # utilisateur base mot_de_passe
  docker compose exec -T -e PGPASSWORD="$3" db psql -h 127.0.0.1 -U "$1" -d "$2" -tAc 'select 1' 2>&1
}
for pair in "identity:$IDENTITY_DB_PASSWORD" "library:$LIBRARY_DB_PASSWORD" "acquisition:$ACQUISITION_DB_PASSWORD"; do
  user="${pair%%:*}"; pass_="${pair#*:}"
  [ "$(psql_as "$user" "$user" "$pass_" | tail -1)" = "1" ] && pass "$user se connecte à sa base" || fail "$user ne se connecte pas à sa base"
  for other in identity library acquisition; do
    [ "$other" = "$user" ] && continue
    out=$(psql_as "$user" "$other" "$pass_")
    echo "$out" | grep -q "CONNECT privilege" && pass "$user ne peut pas se connecter à la base $other" || fail "$user peut atteindre la base $other"
  done
done

if [ "${KEEP_UP:-0}" != "1" ]; then
  echo "== Arrêt (docker compose down, volumes conservés)"
  docker compose down
fi

echo
if [ "$fails" -eq 0 ]; then echo "Test de fumée : TOUT EST OK"; else echo "Test de fumée : $fails échec(s)"; exit 1; fi
