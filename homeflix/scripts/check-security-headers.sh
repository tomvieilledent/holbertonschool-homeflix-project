#!/bin/bash
# Vérifie ce que le reverse proxy (nginx du frontend) envoie et refuse : en-têtes de sécurité, CSP, absence de CORS,
# routes internes bloquées, limite de taille. La pile doit déjà tourner (docker compose up).
#
#   ./scripts/check-security-headers.sh                 # contre http://localhost:8080
#   FRONTEND_PORT=8090 ./scripts/check-security-headers.sh
#
# Script séparé du test de fumée : il ne démarre rien et se lance seul ou en CI après le démarrage de la pile.
set -uo pipefail
cd "$(dirname "$0")/.."

# Le port passé dans l'environnement prime sur celui de .env.
requested_port="${FRONTEND_PORT:-}"
[ -f .env ] && { set -a; . ./.env; set +a; }
BASE="http://localhost:${requested_port:-${FRONTEND_PORT:-8080}}"
fails=0
pass() { printf '  [OK]   %s\n' "$1"; }
fail() { printf '  [FAIL] %s\n' "$1"; fails=$((fails + 1)); }
check() { if eval "$2" > /dev/null 2>&1; then pass "$1"; else fail "$1"; fi; }

headers() { curl -s -D - -o /dev/null -m 10 "$@"; }          # en-têtes de la réponse
status() { curl -s -o /dev/null -m 10 -w '%{http_code}' "$@"; }
header_of() { headers "${@:2}" | tr -d '\r' | grep -i "^$1:" | head -1 | cut -d' ' -f2-; }

echo "== Le proxy répond"
check "la page d'accueil répond 200" '[ "$(status $BASE/)" = 200 ]'

echo "== En-têtes de sécurité (page d'accueil, route SPA, erreur 404 d'API et réponse d'API)"
for url in "/" "/login" "/api/library/internal/x" "/api/library/v1/media"; do
  h=$(headers "$BASE$url" | tr -d '\r')
  for name in Content-Security-Policy X-Content-Type-Options Referrer-Policy X-Frame-Options Permissions-Policy \
              Cross-Origin-Opener-Policy Cross-Origin-Resource-Policy; do
    echo "$h" | grep -qi "^$name:" && pass "$name présent sur $url" || fail "$name absent sur $url"
  done
done
check "X-Content-Type-Options vaut nosniff" '[ "$(header_of X-Content-Type-Options $BASE/)" = nosniff ]'
check "X-Frame-Options vaut DENY" '[ "$(header_of X-Frame-Options $BASE/)" = DENY ]'
check "l'en-tête Server ne révèle pas la version de nginx" '! header_of Server $BASE/ | grep -q "[0-9]"'

echo "== Politique de sécurité du contenu (CSP)"
csp=$(header_of Content-Security-Policy "$BASE/")
has() { echo "$csp" | grep -q -- "$1"; }
check "default-src 'self'" 'has "default-src '"'"'self'"'"'"'
check "script-src 'self' (aucun script en ligne ni externe)" 'has "script-src '"'"'self'"'"';"'
check "style-src 'self'" 'has "style-src '"'"'self'"'"';"'
check "media-src 'self' (lecteur vidéo, flux de l'API)" 'has "media-src '"'"'self'"'"'"'
check "connect-src 'self' (appels fetch vers /api)" 'has "connect-src '"'"'self'"'"'"'
check "frame-ancestors 'none' (clickjacking)" 'has "frame-ancestors '"'"'none'"'"'"'
check "object-src 'none'" 'has "object-src '"'"'none'"'"'"'
check "base-uri 'self' et form-action 'self'" 'has "base-uri '"'"'self'"'"'" && has "form-action '"'"'self'"'"'"'
check "aucun 'unsafe-inline', 'unsafe-eval' ni joker *" '! echo "$csp" | grep -q -E "unsafe-inline|unsafe-eval|[ ]\*[ ;]|[ ]\*$|http:"'

echo "== Pas de CORS : l'interface et l'API partagent la même origine"
check "aucun Access-Control-Allow-Origin, même avec un en-tête Origin étranger" \
  '! headers -H "Origin: http://evil.example" "$BASE/api/library/v1/media" | grep -qi "^access-control-allow"'
check "une requête de pré-vérification (OPTIONS) d'une autre origine n'obtient aucun accord CORS" \
  '! headers -X OPTIONS -H "Origin: http://evil.example" -H "Access-Control-Request-Method: POST" "$BASE/api/identity/v1/auth/login" | grep -qi "^access-control-allow"'

echo "== Origine : une requête du navigateur vers sa propre origine n'est pas prise pour du CORS"
# Un navigateur ajoute « Origin » à tout POST, PUT ou DELETE, même vers sa propre origine. Si le proxy transmet un Host sans
# le port, Spring juge l'origine étrangère et répond 403 « Invalid CORS request ».
for svc in identity library acquisition; do
  check "POST /api/$svc/... avec Origin = $BASE : pas de rejet CORS (403)" \
    '[ "$(status -X POST -H "Origin: $BASE" -H "X-Requested-With: homeflix" $BASE/api/'"$svc"'/v1/probe)" != 403 ]'
done
check "une VRAIE origine étrangère reste rejetée (403 Invalid CORS request)" \
  '[ "$(status -X POST -H "Origin: http://evil.example" -H "X-Requested-With: homeflix" $BASE/api/identity/v1/auth/refresh)" = 403 ]'

echo "== Routes internes et de gestion : toujours 404 par le proxy"
for path in /api/library/internal/purge /api/identity/internal/x /api/acquisition/internal/x \
            /api/library/v1/internal/x /api/library/Internal/x /api/library/INTERNAL/x \
            /api/identity/actuator/health /api/library/actuator/env /api/acquisition/v1/actuator/health \
            /internal/x /internal /actuator/health /actuator/env /Actuator/health; do
  [ "$(status "$BASE$path")" = 404 ] && pass "$path : 404" || fail "$path : $(status "$BASE$path") (attendu 404)"
done
check "variante encodée /api/library/%69nternal/x : 404 (--path-as-is)" '[ "$(status --path-as-is "$BASE/api/library/%69nternal/x")" = 404 ]'
check "variante double barre /api/library//internal/x : 404" '[ "$(status --path-as-is "$BASE/api/library//internal/x")" = 404 ]'
check "variante avec point-virgule /api/library/internal;x : 404" '[ "$(status --path-as-is "$BASE/api/library/internal;x")" = 404 ]'
check "variante avec point /api/library/./internal/x : 404" '[ "$(status --path-as-is "$BASE/api/library/./internal/x")" = 404 ]'
check "les vraies routes de l'API ne sont pas bloquées par erreur (401 sans jeton)" '[ "$(status $BASE/api/library/v1/media)" = 401 ]'

echo "== Limite de taille des requêtes"
check "un corps de plus de 1 Mo est refusé (413)" \
  '[ "$(head -c 1500000 /dev/zero | status -X POST -H "Content-Type: application/json" --data-binary @- $BASE/api/identity/v1/auth/login)" = 413 ]'
check "un petit corps JSON passe le proxy (la réponse vient d'Identity, pas du proxy)" \
  '[ "$(status -X POST -H "Content-Type: application/json" -d "{}" $BASE/api/identity/v1/auth/login)" != 413 ]'

echo
if [ "$fails" -eq 0 ]; then echo "En-têtes et blocages du proxy : TOUT EST OK"; else echo "En-têtes et blocages du proxy : $fails échec(s)"; exit 1; fi
