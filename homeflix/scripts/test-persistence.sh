#!/bin/bash
# Test de démarrage et de persistance : les données survivent-elles au redémarrage des conteneurs ?
#
#   ./scripts/test-persistence.sh                  # crée des données, redémarre la pile deux fois, vérifie
#   ./scripts/test-persistence.sh --simulate-loss  # preuve que le test PEUT échouer : détruit les volumes à la place
#   KEEP=1 ./scripts/test-persistence.sh           # garde le projet de test à la fin (pour enquêter)
#
# Scénario : démarrage d'une pile vierge, puis, par la vraie API, un compte administrateur, un compte utilisateur, un
# profil, un média indexé, une progression de lecture, un favori et un titre corrigé. Ensuite :
#   1. `docker compose restart`  : les conteneurs redémarrent, les volumes sont intacts ;
#   2. `docker compose down` puis `up` : les conteneurs sont RECRÉÉS, les volumes sont conservés.
# Après chaque étape, les données sont relues (API et SQL) et comparées à l'état d'avant : la moindre différence est un
# échec. Le test vérifie aussi que les conteneurs ont réellement redémarré (sinon il ne prouverait rien).
#
# Il tourne dans un PROJET DOCKER ISOLÉ (homeflix-persisttest, port 8096) : il ne touche jamais aux volumes de votre
# vraie pile (homeflix). Avec --simulate-loss, le test réussit uniquement si la perte de données est DÉTECTÉE.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

loss=0
case "${1:-}" in
  -h | --help) sed -n '2,17p' "$0"; exit 0 ;;
  --simulate-loss) loss=1 ;;
  "") ;;
  *) echo "Option inconnue : $1 (voir --help)" >&2; exit 2 ;;
esac

export COMPOSE_PROJECT_NAME=homeflix-persisttest
[ "$COMPOSE_PROJECT_NAME" != "homeflix" ] || { echo "Le projet de test ne doit jamais être celui de la vraie pile." >&2; exit 2; }

./scripts/gen-secrets.sh > /dev/null || exit 1
set -a; . ./.env; set +a
export FRONTEND_PORT=8096        # .env fixe 8080 : le port de test prime

fails=0
pass() { printf '  [OK]   %s\n' "$1"; }
fail() { printf '  [FAIL] %s\n' "$1"; fails=$((fails + 1)); }
dc() { docker compose "$@"; }

work="$(mktemp -d)"
export MEDIA_DIR="$work/media"   # dossier de films de test : l'indexation ne lit que l'extension
mkdir -p "$MEDIA_DIR" && chmod 755 "$work" "$MEDIA_DIR"
printf 'film de test' > "$MEDIA_DIR/film-de-test.mp4" && chmod 644 "$MEDIA_DIR/film-de-test.mp4"
cleanup() {
  if [ "${KEEP:-0}" != 1 ]; then dc down -v > /dev/null 2>&1; fi
  rm -rf -- "$work"
}
trap cleanup EXIT

base="http://localhost:$FRONTEND_PORT"
identity="$base/api/identity/v1"
library="$base/api/library/v1"
admin_user="admin-persistance"; user_name="lea"; password="un-mot-de-passe-de-test-12"

# Appel HTTP : écrit le corps dans $work/body et affiche le code. Arguments : méthode url [jeton [corps JSON]]
call() {
  local args=(-s -o "$work/body" -w '%{http_code}' -X "$1" "$2")
  [ -n "${3:-}" ] && args+=(-H "Authorization: Bearer $3")
  [ -n "${4:-}" ] && args+=(-H 'Content-Type: application/json' -d "$4")
  curl "${args[@]}"
}
field() { sed -n "s/.*\"$1\":\"\([^\"]*\)\".*/\1/p" "$work/body" | head -1; }
number() { sed -n "s/.*\"$1\":\([0-9]*\).*/\1/p" "$work/body" | head -1; }
login() { # utilisateur : affiche le code ; le jeton est lisible avec field accessToken
  call POST "$identity/auth/login" "" "{\"username\":\"$1\",\"password\":\"$password\"}"
}
psql_as() { # base utilisateur mot_de_passe requête
  dc exec -T -e PGPASSWORD="$3" db psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -U "$2" -d "$1" -tAq -c "$4"
}
healthy() { # tous les services de la pile sont-ils healthy ?
  local s
  for s in db identity-service library-service acquisition-service frontend; do
    [ "$(dc ps --format '{{.Health}}' "$s" 2> /dev/null)" = healthy ] || return 1
  done
}

# Photographie de ce qui compte : l'état en base (sans les dates) et ce que voit un client par l'API.
snapshot() {
  echo "## SQL identity"
  psql_as identity identity "$IDENTITY_DB_PASSWORD" "select username, email, role, enabled, password_hash from accounts order by username"
  psql_as identity identity "$IDENTITY_DB_PASSWORD" "select name, avatar from profiles order by name"
  psql_as identity identity "$IDENTITY_DB_PASSWORD" "select (token_hash is null), (completed_at is not null) from setup_state"
  echo "## SQL library"
  psql_as library library "$LIBRARY_DB_PASSWORD" "select path from media_roots order by path"
  psql_as library library "$LIBRARY_DB_PASSWORD" "select relative_path, size_bytes, availability from media_items order by relative_path"
  psql_as library library "$LIBRARY_DB_PASSWORD" "select title, edited from media_metadata order by title"
  psql_as library library "$LIBRARY_DB_PASSWORD" "select position_seconds, duration_seconds, state from progress order by position_seconds"
  psql_as library library "$LIBRARY_DB_PASSWORD" "select count(*) from favourites"
  echo "## API"
  local t_admin t_user t_pid
  echo "connexion administrateur : $(login "$admin_user")"; t_admin="$(field accessToken)"
  echo "connexion utilisateur : $(login "$user_name")"; t_user="$(field accessToken)"
  echo "comptes : $(call GET "$identity/admin/accounts" "$t_admin") $(grep -o '"username":"[^"]*"' "$work/body" | sort | tr '\n' ' ')"
  echo "profils : $(call GET "$identity/profiles" "$t_user") $(grep -o '"name":"[^"]*"' "$work/body" | tr '\n' ' ')"
  echo "sélection du profil : $(call POST "$identity/profiles/$profile_id/select" "$t_user")"; t_pid="$(field accessToken)"
  echo "progression : $(call GET "$library/media/$media_id/progress" "$t_pid") $(number positionSeconds) s sur $(number durationSeconds), $(field state)"
  echo "favoris : $(call GET "$library/me/favourites" "$t_pid") total $(number total)"
  echo "catalogue : $(call GET "$library/media" "$t_pid") $(field title) $(field availability)"
}

# Compare l'état courant à celui d'avant. Argument : libellé de l'étape.
verify() {
  snapshot > "$work/apres.txt" 2>&1
  if diff "$work/avant.txt" "$work/apres.txt" > "$work/diff.txt"; then
    pass "$1 : toutes les données sont IDENTIQUES à l'état d'avant ($(grep -c . "$work/avant.txt") lignes comparées)"
  else
    fail "$1 : des données ont changé ou disparu"; sed 's/^/        /' "$work/diff.txt" | head -20
  fi
}
started() { docker inspect -f '{{.State.StartedAt}}' "$(dc ps -q "$1")" 2> /dev/null; }
container() { dc ps -q "$1" 2> /dev/null; }

echo "== 1. Démarrage d'une pile de test vierge"
if ! dc up -d --build --wait --wait-timeout 420 > /dev/null 2>&1; then fail "la pile de test démarre"; dc ps; exit 1; fi
pass "la pile de test démarre (projet $COMPOSE_PROJECT_NAME, port $FRONTEND_PORT)"

echo "== 2. Création des données par la vraie API"
code="$(call POST "$identity/setup" "" "{\"setupToken\":\"$SETUP_TOKEN\",\"username\":\"$admin_user\",\"email\":\"$admin_user@example.test\",\"password\":\"$password\"}")"
[ "$code" = 201 ] && pass "le premier administrateur est créé (201)" || { fail "création de l'administrateur : HTTP $code"; exit 1; }
code="$(login "$admin_user")"; admin_token="$(field accessToken)"
[ "$code" = 200 ] && [ -n "$admin_token" ] && pass "l'administrateur se connecte (200)" || { fail "connexion de l'administrateur : HTTP $code"; exit 1; }
code="$(call POST "$identity/admin/accounts" "$admin_token" "{\"username\":\"$user_name\",\"email\":\"$user_name@example.test\",\"password\":\"$password\",\"role\":\"USER\"}")"
[ "$code" = 201 ] && pass "un compte utilisateur est créé par l'administrateur (201)" || { fail "création du compte utilisateur : HTTP $code"; exit 1; }
code="$(login "$user_name")"; user_token="$(field accessToken)"
[ "$code" = 200 ] && pass "l'utilisateur se connecte (200)" || { fail "connexion de l'utilisateur : HTTP $code"; exit 1; }
code="$(call POST "$identity/profiles" "$user_token" '{"name":"Alice","avatar":"bleu"}')"; profile_id="$(field id)"
[ "$code" = 201 ] && [ -n "$profile_id" ] && pass "un profil « Alice » est créé (201)" || { fail "création du profil : HTTP $code"; exit 1; }
code="$(call POST "$identity/profiles/$profile_id/select" "$user_token")"; pid_token="$(field accessToken)"
[ "$code" = 200 ] && [ -n "$pid_token" ] && pass "le profil est sélectionné : jeton avec profil actif (200)" || { fail "sélection du profil : HTTP $code"; exit 1; }

code="$(call POST "$library/admin/media-roots" "$admin_token" '{"path":"/media","label":"Films de test"}')"
[ "$code" = 201 ] && pass "le dossier /media est déclaré (201)" || { fail "déclaration du dossier : HTTP $code"; exit 1; }
call POST "$library/admin/index" "$admin_token" > /dev/null
state=""
for _ in $(seq 1 60); do
  call GET "$library/admin/index/status" "$admin_token" > /dev/null; state="$(field state)"
  [ "$state" = RUNNING ] || break
  sleep 1
done
[ "$state" = COMPLETED ] && pass "l'indexation se termine (COMPLETED)" || { fail "indexation : état « $state »"; exit 1; }
code="$(call GET "$library/media" "$pid_token")"; media_id="$(field id)"
[ "$code" = 200 ] && [ -n "$media_id" ] && pass "le film de test apparaît dans le catalogue" || { fail "catalogue vide : HTTP $code"; exit 1; }
code="$(call PUT "$library/media/$media_id/progress" "$pid_token" '{"positionSeconds":754,"durationSeconds":3600}')"
[ "$code" = 200 ] && pass "la progression de lecture (754 s sur 3600) est enregistrée (200)" || fail "progression : HTTP $code"
code="$(call PUT "$library/me/favourites/$media_id" "$pid_token")"
[ "$code" = 204 ] && pass "le film est ajouté à « Ma liste » (204)" || fail "favori : HTTP $code"
code="$(call PATCH "$library/admin/media/$media_id" "$admin_token" '{"title":"Titre corrigé par l administrateur"}')"
[ "$code" = 200 ] && pass "le titre est corrigé par l'administrateur (200)" || fail "correction du titre : HTTP $code"

snapshot > "$work/avant.txt" 2>&1
lines="$(grep -c . "$work/avant.txt")"
[ "$lines" -ge 20 ] && ! grep -q 'connexion .* : 401' "$work/avant.txt" \
  && pass "photographie des données avant redémarrage ($lines lignes, connexions réussies)" || { fail "photographie incomplète"; cat "$work/avant.txt"; exit 1; }
grep -q 'progression : 200 754 s sur 3600, STARTED' "$work/avant.txt" && grep -q 'total 1' "$work/avant.txt" \
  && pass "la photographie contient la progression, le favori et le titre corrigé" || fail "la photographie ne contient pas les données attendues"

if [ "$loss" = 1 ]; then
  echo "== 3. SIMULATION DE PERTE : destruction des volumes (le test doit le détecter)"
  dc down -v > /dev/null 2>&1
  dc up -d --build --wait --wait-timeout 420 > /dev/null 2>&1 && pass "la pile redémarre, vierge" || fail "la pile ne redémarre pas"
  verify "après destruction des volumes"
  echo
  if [ "$fails" -gt 0 ]; then
    echo "Simulation de perte : la perte de données a bien été DÉTECTÉE (le test peut échouer)."
    exit 0
  fi
  echo "Simulation de perte : la perte n'a PAS été détectée, le test ne prouve rien." >&2
  exit 1
fi

echo "== 3. docker compose restart (les conteneurs redémarrent, les volumes restent)"
before_start="$(started identity-service) $(started library-service) $(started db)"
dc restart > /dev/null 2>&1
dc up -d --wait --wait-timeout 420 > /dev/null 2>&1
healthy && pass "tous les services sont healthy après le redémarrage" || fail "un service n'est pas healthy après le redémarrage"
after_start="$(started identity-service) $(started library-service) $(started db)"
[ "$before_start" != "$after_start" ] && pass "les conteneurs ont réellement redémarré (date de démarrage changée)" || fail "les conteneurs n'ont pas redémarré : le test ne prouverait rien"
verify "après docker compose restart"

echo "== 4. docker compose down puis up (conteneurs recréés, volumes conservés)"
before_ids="$(container identity-service) $(container library-service) $(container db)"
dc down > /dev/null 2>&1
[ -n "$(docker volume ls -q --filter "name=${COMPOSE_PROJECT_NAME}_pgdata")" ] && pass "le volume de la base existe encore après down" || fail "le volume de la base a disparu après down"
[ -z "$(container identity-service)" ] && pass "les conteneurs sont supprimés" || fail "des conteneurs subsistent après down"
dc up -d --wait --wait-timeout 420 > /dev/null 2>&1
healthy && pass "tous les services sont healthy après up" || fail "un service n'est pas healthy après up"
after_ids="$(container identity-service) $(container library-service) $(container db)"
[ "$before_ids" != "$after_ids" ] && pass "les conteneurs ont été recréés (nouveaux identifiants)" || fail "les conteneurs n'ont pas été recréés"
verify "après down puis up"

echo "== 5. Le service reste utilisable après les redémarrages"
code="$(login "$user_name")"; user_token="$(field accessToken)"
[ "$code" = 200 ] && pass "la connexion fonctionne toujours avec le même mot de passe" || fail "connexion impossible après redémarrage : HTTP $code"
call POST "$identity/profiles/$profile_id/select" "$user_token" > /dev/null; pid_token="$(field accessToken)"
code="$(call PUT "$library/media/$media_id/progress" "$pid_token" '{"positionSeconds":800,"durationSeconds":3600}')"
[ "$code" = 200 ] && pass "une nouvelle progression peut être enregistrée (200)" || fail "écriture impossible après redémarrage : HTTP $code"

echo
if [ "$fails" -eq 0 ]; then echo "Persistance des données : TOUT EST OK"; else echo "Persistance des données : $fails échec(s)"; exit 1; fi
