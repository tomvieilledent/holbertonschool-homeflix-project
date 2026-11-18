#!/bin/bash
# Test de fumée de la pile HomeFlix : démarre, vérifie la santé, l'isolation réseau et
# l'isolation des bases, puis arrête.
#
#   ./scripts/smoke.sh            # démarre, vérifie, arrête (les volumes sont conservés)
#   KEEP_UP=1 ./scripts/smoke.sh  # laisse la pile démarrée
#   CHECK_PERSISTENCE=1 ./scripts/smoke.sh  # vérifie aussi que les données survivent à down puis up
#   CHECK_P2P=1 ./scripts/smoke.sh          # télécharge réellement Sintel par BitTorrent (Internet requis)
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

echo "== Library valide les jetons d'Identity (appel interservices Library -> Identity, #19)"
# Library n'a aucune clé : elle récupère le JWKS (clés publiques) d'Identity sur le réseau interne. On forge donc
# des jetons avec la clé privée de l'environnement de test (.env) et on regarde ce que Library en fait. Un jeton
# accepté PROUVE que Library a joint Identity (sinon elle n'aurait aucune clé pour vérifier la signature).
smoke_tmp=$(mktemp -d)
umask 077
echo "$JWT_PRIVATE_KEY_BASE64" | base64 -d > "$smoke_tmp/identity.pem" 2> /dev/null
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$smoke_tmp/other.pem" 2> /dev/null
b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
# mint_jwt <clé PEM> <rôles JSON> <émetteur> <secondes avant expiration (négatif = expiré)>
mint_jwt() {
  local now header payload sig
  now=$(date +%s)
  header=$(printf '{"alg":"RS256","typ":"JWT"}' | b64url)
  payload=$(printf '{"sub":"%s","iss":"%s","iat":%s,"exp":%s,"roles":%s}' \
    "$(cat /proc/sys/kernel/random/uuid)" "$3" "$now" "$((now + $4))" "$2" | b64url)
  sig=$(printf '%s.%s' "$header" "$payload" | openssl dgst -sha256 -sign "$1" -binary | b64url)
  printf '%s.%s.%s' "$header" "$payload" "$sig"
}
library_code() { # <jeton ou vide> : code HTTP de GET /admin/media-roots, par le reverse proxy
  curl -s -o /dev/null -w '%{http_code}' ${1:+-H "Authorization: Bearer $1"} "http://localhost:${FRONTEND_PORT}/api/library/v1/admin/media-roots"
}
if [ -s "$smoke_tmp/identity.pem" ]; then
  check "sans jeton : 401" '[ "$(library_code)" = 401 ]'
  check "jeton signé par la clé d'Identity, rôle ADMIN : 200 (Library a récupéré le JWKS d'Identity)" \
    '[ "$(library_code "$(mint_jwt "$smoke_tmp/identity.pem" "[\"ADMIN\"]" homeflix-identity 300)")" = 200 ]'
  check "jeton valide mais rôle USER sur une route ADMIN : 403" \
    '[ "$(library_code "$(mint_jwt "$smoke_tmp/identity.pem" "[\"USER\"]" homeflix-identity 300)")" = 403 ]'
  check "jeton signé par une autre clé : 401" \
    '[ "$(library_code "$(mint_jwt "$smoke_tmp/other.pem" "[\"ADMIN\"]" homeflix-identity 300)")" = 401 ]'
  check "jeton d'un autre émetteur : 401" \
    '[ "$(library_code "$(mint_jwt "$smoke_tmp/identity.pem" "[\"ADMIN\"]" autre-emetteur 300)")" = 401 ]'
  check "jeton expiré : 401" \
    '[ "$(library_code "$(mint_jwt "$smoke_tmp/identity.pem" "[\"ADMIN\"]" homeflix-identity -3600)")" = 401 ]'
else
  fail "la clé privée de .env est illisible : impossible de forger un jeton de test"
fi
rm -rf "$smoke_tmp"

echo "== Volumes et droits"
dc() { docker compose exec -T "$@"; }
check "Library ne peut pas écrire dans /media (lecture seule)" "! dc library-service sh -c 'touch /media/.smoke-ro'"
check "Library ne peut pas écrire dans /downloads (lecture seule)" "! dc library-service sh -c 'touch /downloads/.smoke-ro'"
check "Transmission écrit dans /downloads" "dc transmission sh -c 'touch /downloads/.smoke-t'"
check "Library lit un fichier écrit par Transmission" "dc library-service sh -c 'test -r /downloads/.smoke-t'"
check "Acquisition supprime un fichier écrit par Transmission (UID/GID alignés)" "dc acquisition-service sh -c 'rm /downloads/.smoke-t'"
check "Acquisition écrit dans /downloads" "dc acquisition-service sh -c 'touch /downloads/.smoke-a && rm /downloads/.smoke-a'"
# /media existe (vide) dans les images de base : ce qui compte, c'est que la bibliothèque n'y soit pas montée.
check "Acquisition et Transmission n'ont pas la bibliothèque montée (/media)" "! dc acquisition-service grep -q ' /media ' /proc/mounts && ! dc transmission grep -q ' /media ' /proc/mounts"
check "Library a bien /media montée" "dc library-service grep -q ' /media ' /proc/mounts"

echo "== Transmission : isolation et réglages"
RPC=http://transmission:9091/transmission/rpc
check "l'interface de Transmission est injoignable depuis l'hôte (9091 et 51413 non publiés)" "! curl -s -m 3 -o /dev/null http://localhost:9091/transmission/rpc && ! curl -s -m 3 -o /dev/null http://localhost:51413/"
check "Library ne peut pas joindre Transmission" "! dc library-service curl -s -m 3 -o /dev/null $RPC"
check "Identity ne peut pas joindre Transmission" "! dc identity-service curl -s -m 3 -o /dev/null $RPC"
check "le frontend ne peut pas joindre Transmission" "dc frontend sh -c 'command -v wget > /dev/null && ! wget -q -T 3 -O /dev/null $RPC'"
check "la base ne peut pas joindre Transmission" "dc db sh -c 'command -v wget > /dev/null && ! wget -q -T 3 -O /dev/null $RPC'"
# Code HTTP du RPC vu depuis Acquisition : « ok » = bons identifiants, « faux » = mauvais mot de passe, autre = aucun.
rpc_code() {
  dc acquisition-service sh -c 'case "$1" in
    ok) set -- -u "$TRANSMISSION_USER:$TRANSMISSION_PASS" ;;
    faux) set -- -u "$TRANSMISSION_USER:faux" ;;
    *) set -- ;;
  esac
  curl -s -m 5 -o /dev/null -w "%{http_code}" "$@" http://transmission:9091/transmission/rpc' _ "$1"
}
check "Acquisition atteint le RPC, qui exige un mot de passe (401 sans)" '[ "$(rpc_code aucun)" = 401 ]'
check "Acquisition s'authentifie auprès du RPC (409 = poignée de main de session)" '[ "$(rpc_code ok)" = 409 ]'
check "un mauvais mot de passe est refusé (401)" '[ "$(rpc_code faux)" = 401 ]'
settings() { dc transmission jq -e "$1" /config/settings.json; }
check "authentification du RPC exigée" "settings '.[\"rpc-authentication-required\"] == true'"
check "arrêt du partage à la fin du téléchargement (ratio 0)" "settings '.[\"ratio-limit-enabled\"] == true and .[\"ratio-limit\"] == 0'"
check "débits d'envoi et de réception plafonnés" "settings '.[\"speed-limit-up-enabled\"] == true and .[\"speed-limit-down-enabled\"] == true'"
check "DHT et PEX désactivés par défaut" "[ \"\${TRANSMISSION_DHT:-false}\" = true ] || settings '.[\"dht-enabled\"] == false and .[\"pex-enabled\"] == false'"
check "port de pairs fixe (51413)" "settings '.[\"peer-port\"] == 51413'"
check "version de Transmission épinglée (pas de latest)" "docker compose config --images | grep transmission | grep -v ':latest'"

if [ "${CHECK_P2P:-0}" = "1" ]; then
  echo "== Téléchargement P2P réel (Sintel, voir docs/legal/P2P_DEMO.md) : besoin d'Internet et de pairs"
  magnet='magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.empire-js.us%3A1337'
  tr() { dc transmission sh -c "transmission-remote localhost:9091 -n \"\$USER:\$PASS\" $1"; }
  tr '-t all --remove-and-delete' > /dev/null 2>&1
  tr "-a '$magnet'" > /dev/null 2>&1
  done_=no
  for _ in $(seq 1 36); do   # 3 minutes au plus
    tr '-l' 2> /dev/null | sed -n 2p | grep -q ' 100%' && { done_=yes; break; }
    sleep 5
  done
  [ "$done_" = yes ] && pass "Sintel téléchargé par BitTorrent" || fail "Sintel n'a pas fini de se télécharger en 3 minutes (réseau bloquant ? pairs ?)"
  sum=$(dc transmission sha256sum /downloads/complete/Sintel/Sintel.mp4 2> /dev/null | cut -d' ' -f1)
  [ "$sum" = 1dc6f2ca9762dfcc7d1b1843129a3e4f351d1fe935dea2241c7b359c11ebc1d8 ] && pass "le fichier reçu est identique à celui dont la licence est documentée (SHA-256)" || fail "SHA-256 inattendu : ${sum:-aucun fichier}"
  check "Library lit le fichier téléchargé" "dc library-service test -r /downloads/complete/Sintel/Sintel.mp4"
  tr '-t all --remove-and-delete' > /dev/null 2>&1   # remet l'environnement propre
fi

if [ "${CHECK_PERSISTENCE:-0}" = "1" ]; then
  echo "== Persistance des données (docker compose down puis up)"
  dc db psql -U postgres -d postgres -qc "create table if not exists smoke_persist (v text); insert into smoke_persist values ('avant-arret')" > /dev/null
  docker compose down > /dev/null 2>&1
  if docker compose up -d --wait --wait-timeout 420 > /dev/null 2>&1; then
    [ "$(dc db psql -U postgres -d postgres -tAc 'select v from smoke_persist' | tail -1)" = "avant-arret" ] \
      && pass "les données PostgreSQL survivent à down puis up" || fail "les données PostgreSQL ont disparu après down puis up"
    dc db psql -U postgres -d postgres -qc 'drop table if exists smoke_persist' > /dev/null
  else
    fail "la pile ne redémarre pas après down"
  fi
fi

if [ "${KEEP_UP:-0}" != "1" ]; then
  echo "== Arrêt (docker compose down, volumes conservés)"
  docker compose down
fi

echo
if [ "$fails" -eq 0 ]; then echo "Test de fumée : TOUT EST OK"; else echo "Test de fumée : $fails échec(s)"; exit 1; fi
