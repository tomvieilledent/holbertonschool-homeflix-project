#!/bin/bash
# Test complet de la sauvegarde et de la restauration : sauvegarde -> destruction des volumes -> restauration sur pile
# vierge -> comparaison des données. Il tourne dans un PROJET DOCKER ISOLÉ (homeflix-backuptest, port 8097) : il ne
# touche jamais aux volumes de votre vraie pile (homeflix).
#
#   ./scripts/test-backup-restore.sh          # dure quelques minutes (la pile démarre deux fois)
#   KEEP=1 ./scripts/test-backup-restore.sh   # garde le projet de test à la fin (pour enquêter)
#
# Ce que le test vérifie : le compte administrateur (avec son mot de passe haché), le profil, la progression, les
# favoris, le catalogue et un téléchargement terminé sont RETROUVÉS à l'identique ; la restauration sans confirmation
# et celle d'une archive abîmée sont REFUSÉES sans rien modifier ; l'archive n'est lisible que par son propriétaire et
# ne contient ni médias ni secrets.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

export COMPOSE_PROJECT_NAME=homeflix-backuptest
export FRONTEND_PORT=8097
[ "$COMPOSE_PROJECT_NAME" != "homeflix" ] || { echo "Le projet de test ne doit jamais être celui de la vraie pile." >&2; exit 2; }

./scripts/gen-secrets.sh > /dev/null || exit 1
set -a; . ./.env; set +a
export FRONTEND_PORT=8097        # .env fixe 8080 : le port de test prime

fails=0
pass() { printf '  [OK]   %s\n' "$1"; }
fail() { printf '  [FAIL] %s\n' "$1"; fails=$((fails + 1)); }
check() { if eval "$2" > /dev/null 2>&1; then pass "$1"; else fail "$1"; fi; }

dc() { docker compose "$@"; }
psql_as() { # base utilisateur mot_de_passe requête
  dc exec -T -e PGPASSWORD="$3" db psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -U "$2" -d "$1" -tAq -c "$4"
}

# Les tables d'Acquisition (catalogue, téléchargements) viennent de l'issue #60 : le test les couvre dès qu'elles existent.
has_table() { [ "$(psql_as "$1" "$2" "$3" "select to_regclass('public.$4') is not null")" = t ]; }

work="$(mktemp -d)"
export BACKUP_DIR="$work/backups"
cleanup() {
  if [ "${KEEP:-0}" != 1 ]; then dc down -v > /dev/null 2>&1; fi
  rm -rf "$work"
}
trap cleanup EXIT

# Photographie des données qui comptent (sans les dates, qui changent à chaque création).
snapshot() {
  echo "## identity"
  psql_as identity identity "$IDENTITY_DB_PASSWORD" "select username, email, role, enabled, password_hash from accounts order by username"
  psql_as identity identity "$IDENTITY_DB_PASSWORD" "select name, avatar from profiles order by name"
  psql_as identity identity "$IDENTITY_DB_PASSWORD" "select (token_hash is null) as token_efface, (completed_at is not null) as setup_termine from setup_state"
  echo "## library"
  psql_as library library "$LIBRARY_DB_PASSWORD" "select relative_path, size_bytes, availability from media_items order by relative_path"
  psql_as library library "$LIBRARY_DB_PASSWORD" "select position_seconds, duration_seconds, state from progress order by position_seconds"
  psql_as library library "$LIBRARY_DB_PASSWORD" "select count(*) from favourites"
  echo "## acquisition"
  if $acq_ready; then
    psql_as acquisition acquisition "$ACQUISITION_DB_PASSWORD" "select title, license, license_proof_url, infohash from catalogue_entries order by title"
    psql_as acquisition acquisition "$ACQUISITION_DB_PASSWORD" "select notice_version from rights_acknowledgements order by notice_version"
    psql_as acquisition acquisition "$ACQUISITION_DB_PASSWORD" "select state, progress_percent, file_relative_path from downloads order by state"
  fi
}

echo "== 1. Démarrage d'une pile de test et création de données"
if ! dc up -d --build --wait --wait-timeout 420 > /dev/null 2>&1; then fail "la pile de test démarre"; exit 1; fi
pass "la pile de test démarre (projet $COMPOSE_PROJECT_NAME, port $FRONTEND_PORT)"

# Le compte administrateur est créé par la VRAIE API (jeton de setup), donc avec un vrai hachage Argon2id.
code="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d "{\"setupToken\":\"$SETUP_TOKEN\",\"username\":\"admin-sauvegarde\",\"email\":\"admin-sauvegarde@example.test\",\"password\":\"un-mot-de-passe-de-test-12\"}" \
  "http://localhost:$FRONTEND_PORT/api/identity/v1/setup")"
[ "$code" = 201 ] && pass "le premier administrateur est créé par l'API (201)" || fail "création de l'administrateur : HTTP $code"

acq_ready=false
has_table acquisition acquisition "$ACQUISITION_DB_PASSWORD" catalogue_entries && acq_ready=true
$acq_ready && pass "les tables d'Acquisition existent : catalogue et téléchargements sont couverts" \
  || echo "  [INFO] tables d'Acquisition absentes sur ce code (issue #60 non fusionnée) : non couvertes"

account="$(psql_as identity identity "$IDENTITY_DB_PASSWORD" "select id from accounts where username = 'admin-sauvegarde'")"
profile="$(cat /proc/sys/kernel/random/uuid)"; media="$(cat /proc/sys/kernel/random/uuid)"; root="$(cat /proc/sys/kernel/random/uuid)"
psql_as identity identity "$IDENTITY_DB_PASSWORD" "insert into profiles (id, account_id, name, avatar) values ('$profile', '$account', 'Alice', 'avatar-3')" > /dev/null
psql_as library library "$LIBRARY_DB_PASSWORD" "
  insert into media_roots (id, path, label) values ('$root', '/media/test', 'Films de test');
  insert into media_items (id, root_id, relative_path, size_bytes, file_mtime, fingerprint, last_seen_at)
    values ('$media', '$root', 'film-de-test.mp4', 123456, now(), 'empreinte-de-test', now());
  insert into progress (account_id, profile_id, media_id, position_seconds, duration_seconds, state)
    values ('$account', '$profile', '$media', 754, 3600, 'STARTED');
  insert into favourites (account_id, profile_id, media_id) values ('$account', '$profile', '$media')" > /dev/null
$acq_ready && psql_as acquisition acquisition "$ACQUISITION_DB_PASSWORD" "
  insert into rights_acknowledgements (account_id, notice_version) values ('$account', '2026-11');
  insert into downloads (id, entry_id, requested_by, state, progress_percent, file_relative_path)
    values (gen_random_uuid(), '7d1c0a52-3f6e-4b8a-9c21-0f4a6e2b1d11', '$account', 'COMPLETED', 100, 'Sintel/Sintel.mp4')" > /dev/null
pass "profil, progression (754 s sur 3600) et favori créés$($acq_ready && echo ", avec l'acquittement des droits et un téléchargement terminé")"

snapshot > "$work/avant.txt"
[ "$(grep -c . "$work/avant.txt")" -ge 8 ] && pass "photographie des données avant sauvegarde ($(grep -c . "$work/avant.txt") lignes)" || fail "photographie vide"

echo "== 2. Sauvegarde"
archive="$(./scripts/backup.sh | sed -n 's/^Sauvegarde créée : \(.*\) (.*)$/\1/p')"
[ -n "$archive" ] && [ -f "$archive" ] && pass "l'archive est créée : $(basename "$archive")" || { fail "l'archive est créée"; exit 1; }
check "le nom est horodaté (homeflix-backup-AAAAMMJJ-HHMMSS.tar.gz)" "[[ \"$(basename "$archive")\" =~ ^homeflix-backup-[0-9]{8}-[0-9]{6}\.tar\.gz$ ]]"
check "l'archive n'est lisible que par son propriétaire (600)" "[ \"\$(stat -c %a '$archive')\" = 600 ]"
check "le dossier des sauvegardes est privé (700)" "[ \"\$(stat -c %a '$BACKUP_DIR')\" = 700 ]"
listing="$(tar -tzf "$archive")"
check "l'archive contient les 3 bases, le manifeste et les sommes SHA-256" "[ \"\$(echo '$listing' | tr '\n' ' ')\" = 'manifest.txt SHA256SUMS identity.dump library.dump acquisition.dump ' ]"
check "aucun média ni fichier .env dans l'archive" "! echo '$listing' | grep -E -i '\.(mp4|mkv|webm|m4v)\$|\.env'"
mkdir "$work/x" && tar -xzf "$archive" -C "$work/x"
check "aucun secret du .env n'est présent dans l'archive (mots de passe de bases, clé JWT, jeton de setup)" \
  "! grep -r -a -l -e \"$POSTGRES_PASSWORD\" -e \"$IDENTITY_DB_PASSWORD\" -e \"$SETUP_TOKEN\" -e \"${JWT_PRIVATE_KEY_BASE64:0:60}\" '$work/x'"
check "le manifeste donne le nombre de lignes par table" "grep -q '^accounts=1\$' '$work/x/manifest.txt'"

echo "== 3. Refus sans confirmation, et refus d'une archive abîmée (rien ne doit être modifié)"
./scripts/restore.sh "$archive" < /dev/null > "$work/refus.log" 2>&1; rc=$?
[ "$rc" -ne 0 ] && grep -q "avec --yes\|--yes" "$work/refus.log" && pass "sans terminal ni --yes, la restauration est refusée" || fail "refus sans confirmation (code $rc)"
echo "pas-RESTAURER" | ./scripts/restore.sh "$archive" > "$work/refus2.log" 2>&1; rc=$?
[ "$rc" -ne 0 ] && pass "sans terminal, même une réponse sur l'entrée standard n'est pas acceptée comme confirmation" || fail "réponse non interactive acceptée"
cp "$archive" "$work/abimee.tar.gz"
mkdir "$work/t" && tar -xzf "$archive" -C "$work/t" && printf 'X' | dd of="$work/t/library.dump" bs=1 seek=100 conv=notrunc 2> /dev/null \
  && tar -czf "$work/abimee.tar.gz" -C "$work/t" manifest.txt SHA256SUMS identity.dump library.dump acquisition.dump
./scripts/restore.sh "$work/abimee.tar.gz" --yes > "$work/refus3.log" 2>&1; rc=$?
[ "$rc" -ne 0 ] && grep -q "SHA-256" "$work/refus3.log" && pass "une archive dont un export a été modifié est refusée (somme SHA-256)" || fail "archive abîmée non détectée (code $rc)"
snapshot > "$work/apres-refus.txt"
diff -q "$work/avant.txt" "$work/apres-refus.txt" > /dev/null && pass "après ces refus, les données sont strictement intactes" || fail "des données ont changé malgré les refus"

echo "== 4. Destruction totale des volumes"
dc down -v > /dev/null 2>&1
[ -z "$(docker volume ls -q --filter "name=${COMPOSE_PROJECT_NAME}_pgdata")" ] && pass "le volume de la base est supprimé" || fail "le volume de la base existe encore"
[ -z "$(docker ps -aq --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME")" ] && pass "aucun conteneur du projet ne subsiste" || fail "des conteneurs subsistent"

echo "== 5. Restauration sur pile vierge"
if ./scripts/restore.sh "$archive" --yes > "$work/restauration.log" 2>&1; then pass "la restauration réussit et la pile redémarre (healthy)"; else fail "la restauration échoue"; tail -15 "$work/restauration.log"; fi
grep -q "pile vierge" "$work/restauration.log" && pass "l'état actuel est vide : le script ne fait pas de sauvegarde de sécurité inutile" || fail "message de pile vierge absent"
for s in identity-service library-service acquisition-service frontend; do
  [ "$(dc ps --format '{{.Health}}' "$s" 2> /dev/null)" = healthy ] && pass "$s est healthy après la restauration" || fail "$s n'est pas healthy"
done

echo "== 6. Les données sont-elles retrouvées ?"
snapshot > "$work/apres.txt"
if diff "$work/avant.txt" "$work/apres.txt" > "$work/diff.txt"; then
  pass "comptes, profil, progression et favoris$($acq_ready && echo ", catalogue, acquittement et téléchargement") : IDENTIQUES à l'avant-sauvegarde"
else
  fail "les données diffèrent"; cat "$work/diff.txt"
fi
check "le mot de passe haché de l'administrateur est retrouvé (même compte, même hachage Argon2id)" "grep -q 'argon2id' '$work/apres.txt'"
check "la progression de lecture (754 s sur 3600) est retrouvée" "grep -q '^754|3600|STARTED\$' '$work/apres.txt'"
check "le jeton de setup reste effacé : on ne peut pas recréer un administrateur" \
  "[ \"\$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{\"setupToken\":\"$SETUP_TOKEN\",\"username\":\"intrus\",\"email\":\"intrus@example.test\",\"password\":\"un-mot-de-passe-de-test-12\"}' http://localhost:$FRONTEND_PORT/api/identity/v1/setup)\" = 409 ]"

echo "== 7. Restauration d'un état non vide : sauvegarde de sécurité automatique"
./scripts/restore.sh "$archive" --yes > "$work/restauration2.log" 2>&1 && pass "une seconde restauration (sur un état non vide) réussit" || fail "seconde restauration"
check "une sauvegarde pre-restore-... a été créée avant d'écraser l'état" "ls '$BACKUP_DIR'/pre-restore-*.tar.gz"

echo
if [ "$fails" -eq 0 ]; then echo "Sauvegarde et restauration : TOUT EST OK"; else echo "Sauvegarde et restauration : $fails échec(s)"; exit 1; fi
