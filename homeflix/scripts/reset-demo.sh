#!/bin/bash
# Remet l'environnement de démonstration à zéro : efface TOUTES les données de la pile, la redémarre vierge, puis recrée
# les comptes de démonstration, leurs profils et le catalogue. Idempotent : on peut le lancer autant de fois que voulu.
#
#   ./scripts/reset-demo.sh           # demande une confirmation (taper RESET)
#   ./scripts/reset-demo.sh --yes     # sans confirmation
#   ./scripts/reset-demo.sh --build   # reconstruit aussi les images (après un changement de code)
#   DEMO_PASSWORD=... ./scripts/reset-demo.sh   # impose le mot de passe de démonstration (12 à 128 caractères)
#
# Ce qui est effacé (docker compose down -v) : comptes, profils, catalogue, progression, favoris, téléchargements en
# cours ou terminés (volume « downloads ») et état de Transmission. Ce qui est conservé : le fichier .env (et donc ses
# secrets), les images, vos films (MEDIA_DIR). Un dossier de l'hôte choisi avec DOWNLOADS_DIR n'est PAS vidé.
#
# Ce qui est créé : un administrateur (demo-admin), deux utilisateurs (demo-famille avec les profils Alice et Bob,
# demo-invite avec le profil Invité), les dossiers /media et /downloads déclarés dans Library, les films indexés et
# leurs métadonnées corrigées. Le mot de passe de démonstration est tiré au hasard à chaque reset (rien de fixe dans le
# dépôt) : il est affiché à la fin et écrit dans .demo-credentials (droits 600, ignoré par Git).
# NE JAMAIS réutiliser ces comptes ni ce mot de passe en production (voir docs/DEMO.md).
#
# Pour une pile de test qui n'est pas la vraie : COMPOSE_PROJECT_NAME=autre-nom FRONTEND_PORT=8097 ./scripts/reset-demo.sh --yes
# Prérequis : Docker Compose, curl, openssl, des films dans MEDIA_DIR (voir ./scripts/fetch-demo-media.sh).
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

assume_yes=0
build_flag=()
while [ $# -gt 0 ]; do
  case "$1" in
    -h | --help) sed -n '2,19p' "$0"; exit 0 ;;
    -y | --yes) assume_yes=1 ;;
    --build) build_flag=(--build) ;;
    *) echo "Option inconnue : $1 (voir --help)" >&2; exit 2 ;;
  esac
  shift
done

die() { echo "Erreur : $1" >&2; exit 1; }
for cmd in docker curl openssl; do command -v "$cmd" > /dev/null || die "commande manquante : $cmd"; done
docker compose version > /dev/null 2>&1 || die "Docker Compose est introuvable."

port_override="${FRONTEND_PORT:-}"   # une valeur donnée sur la ligne de commande prime sur celle de .env
./scripts/gen-secrets.sh > /dev/null || exit 1
set -a; . ./.env; set +a
FRONTEND_PORT="${port_override:-${FRONTEND_PORT:-8080}}"
export FRONTEND_PORT

dc() { docker compose "$@"; }

# --- Contrôles AVANT de rien détruire ------------------------------------------------------------------------------
media_dir="${MEDIA_DIR:-./demo-media}"
[ -d "$media_dir" ] || die "le dossier de films $media_dir n'existe pas (MEDIA_DIR)."
films="$(find "$media_dir" -maxdepth 3 -type f \( -iname '*.mp4' -o -iname '*.mkv' -o -iname '*.webm' \) | wc -l)"
[ "$films" -gt 0 ] || die "aucun film dans $media_dir : lancez ./scripts/fetch-demo-media.sh avant le reset (rien n'a été effacé)."
if find "$media_dir" -maxdepth 3 -type f -iname 'sintel*' | grep -q .; then
  echo "Attention : $media_dir contient Sintel. Pour la démonstration du téléchargement P2P (docs/legal/P2P_DEMO.md), Sintel"
  echo "doit arriver par BitTorrent : retirez ce fichier, sinon le film sera présent avant le téléchargement."
fi
if [ -n "${DOWNLOADS_DIR:-}" ]; then
  echo "Attention : DOWNLOADS_DIR=$DOWNLOADS_DIR est un dossier de l'hôte : le reset ne le vide pas (supprimez son contenu vous-même)."
fi

demo_password="${DEMO_PASSWORD:-}"
if [ -z "$demo_password" ]; then
  demo_password="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 16)"
fi
if [ "${#demo_password}" -lt 12 ] || [ "${#demo_password}" -gt 128 ]; then
  die "DEMO_PASSWORD doit faire entre 12 et 128 caractères."
fi

echo "Reset de la pile « ${COMPOSE_PROJECT_NAME:-homeflix} » (http://localhost:$FRONTEND_PORT) : TOUTES ses données vont être effacées."
if [ "$assume_yes" != 1 ]; then
  [ -t 0 ] || die "pas de terminal pour confirmer : relancez avec --yes pour continuer sans confirmation. Rien n'a été effacé."
  read -r -p "Taper RESET pour continuer : " answer
  [ "$answer" = RESET ] || die "annulé, rien n'a été effacé."
fi

started_at=$SECONDS
step() { printf '== %s (à %s s)\n' "$1" "$((SECONDS - started_at))"; }
base="http://localhost:$FRONTEND_PORT"
identity="$base/api/identity/v1"
library="$base/api/library/v1"
work="$(mktemp -d)"
trap 'rm -rf -- "$work"' EXIT

# Appel HTTP : écrit le corps dans $work/body et affiche le code. Arguments : méthode url [jeton [corps JSON]].
# Le corps (qui peut contenir un mot de passe) passe par l'entrée standard, jamais par la ligne de commande.
call() {
  local args=(-s -o "$work/body" -w '%{http_code}' -X "$1" "$2")
  [ -n "${3:-}" ] && args+=(-H "Authorization: Bearer $3")
  if [ -n "${4:-}" ]; then
    printf '%s' "$4" | curl "${args[@]}" -H 'Content-Type: application/json' --data-binary @-
  else
    curl "${args[@]}"
  fi
}
field() { sed -n "s/.*\"$1\":\"\([^\"]*\)\".*/\1/p" "$work/body" | head -1; }
# expect <code attendu> <code reçu> <description> : arrête tout en cas d'écart
expect() {
  [ "$1" = "$2" ] && { printf '  [OK]   %s\n' "$3"; return 0; }
  printf '  [FAIL] %s : HTTP %s (attendu %s)\n' "$3" "$2" "$1" >&2
  sed 's/^/         /' "$work/body" 2> /dev/null | head -5 >&2
  exit 1
}

step "1. Effacement des données (docker compose down -v)"
dc down -v --remove-orphans > /dev/null 2>&1 || die "docker compose down -v a échoué."

step "2. Démarrage d'une pile vierge"
# Un service Java peut planter une fois au démarrage (la politique de redémarrage le relance), alors que « up --wait »
# abandonne dès qu'un service est en échec : on réessaie quelques fois en laissant le temps au redémarrage.
attempt=1
until dc up -d ${build_flag[@]+"${build_flag[@]}"} --wait --wait-timeout 420 > "$work/up.log" 2>&1; do
  if [ "$attempt" -ge 5 ]; then
    tail -20 "$work/up.log" >&2; dc ps >&2
    die "la pile ne démarre pas jusqu'à l'état healthy (5 essais)."
  fi
  attempt=$((attempt + 1)); build_flag=()
  echo "  [WARN] un service a échoué au démarrage (la pile se relance seule) : essai $attempt sur 5 dans 20 s"
  sleep 20
done
echo "  [OK]   tous les services sont healthy"

step "3. Comptes de démonstration"
code="$(call POST "$identity/setup" "" "{\"setupToken\":\"$SETUP_TOKEN\",\"username\":\"demo-admin\",\"email\":\"demo-admin@example.test\",\"password\":\"$demo_password\"}")"
expect 201 "$code" "administrateur demo-admin créé (/setup)"
code="$(call POST "$identity/auth/login" "" "{\"username\":\"demo-admin\",\"password\":\"$demo_password\"}")"
admin_token="$(field accessToken)"
[ -n "$admin_token" ] || expect 200 "$code" "connexion de demo-admin"
expect 200 "$code" "demo-admin se connecte"
code="$(call POST "$identity/profiles" "$admin_token" '{"name":"Admin","avatar":"gris"}')"
expect 201 "$code" "profil « Admin » (pour que l'administrateur puisse aussi regarder)"

# create_user <nom> <profil:avatar>... : crée le compte (par l'administrateur), se connecte, crée les profils
create_user() {
  local name="$1" token spec
  shift
  code="$(call POST "$identity/admin/accounts" "$admin_token" "{\"username\":\"$name\",\"email\":\"$name@example.test\",\"password\":\"$demo_password\",\"role\":\"USER\"}")"
  expect 201 "$code" "compte $name créé par l'administrateur"
  code="$(call POST "$identity/auth/login" "" "{\"username\":\"$name\",\"password\":\"$demo_password\"}")"
  token="$(field accessToken)"
  [ -n "$token" ] || expect 200 "$code" "connexion de $name"
  for spec in "$@"; do
    code="$(call POST "$identity/profiles" "$token" "{\"name\":\"${spec%%:*}\",\"avatar\":\"${spec#*:}\"}")"
    expect 201 "$code" "profil « ${spec%%:*} » pour $name"
  done
}
create_user demo-famille Alice:bleu Bob:rouge
create_user demo-invite Invité:vert

step "4. Catalogue"
code="$(call POST "$library/admin/media-roots" "$admin_token" '{"path":"/media","label":"Films de démonstration"}')"
expect 201 "$code" "dossier /media déclaré dans Library"
code="$(call POST "$library/admin/media-roots" "$admin_token" '{"path":"/downloads","label":"Téléchargements"}')"
expect 201 "$code" "dossier /downloads déclaré (les films téléchargés y seront indexés)"
code="$(call POST "$library/admin/index" "$admin_token")"
[ "$code" = 202 ] || [ "$code" = 200 ] || expect 202 "$code" "indexation lancée"
state=""
for _ in $(seq 1 90); do
  call GET "$library/admin/index/status" "$admin_token" > /dev/null; state="$(field state)"
  [ "$state" = RUNNING ] || break
  sleep 1
done
[ "$state" = COMPLETED ] || { echo "  [FAIL] indexation : état « ${state:-inconnu} »" >&2; exit 1; }
echo "  [OK]   indexation terminée"

# Métadonnées lisibles pour la démonstration (titre, genres, année, mention de la licence). Pour chaque film présent.
call GET "$library/media?size=50" "$admin_token" > /dev/null
# Le corps est du JSON sur une ligne : on découpe en objets « {"id":... } » pour rapprocher l'identifiant du nom de fichier.
tr '{' '\n' < "$work/body" > "$work/items.txt"
set_metadata() { # <motif du nom de fichier> <corps JSON>
  local id
  id="$(grep -i "$1" "$work/items.txt" | sed -n 's/.*"id":"\([0-9a-f-]\{36\}\)".*/\1/p' | head -1)"
  [ -n "$id" ] || return 0   # film absent de la bibliothèque : rien à corriger
  code="$(call PATCH "$library/admin/media/$id" "$admin_token" "$2")"
  expect 200 "$code" "métadonnées de « $1 » corrigées"
}
set_metadata 'big-buck-bunny' '{"title":"Big Buck Bunny","year":2008,"genres":["Animation","Comédie"],"description":"© Blender Foundation | www.bigbuckbunny.org, licence CC BY 3.0."}'
set_metadata 'sintel' '{"title":"Sintel","year":2010,"genres":["Animation","Fantastique"],"description":"© Blender Foundation | durian.blender.org, licence CC BY 3.0."}'

elapsed=$((SECONDS - started_at))
cred=.demo-credentials
(umask 077; {
  echo "# Comptes de démonstration HomeFlix (généré par reset-demo.sh). NE JAMAIS les réutiliser en production."
  echo "url=http://localhost:$FRONTEND_PORT"
  echo "mot_de_passe=$demo_password"
  echo "comptes=demo-admin (ADMIN), demo-famille (USER : Alice, Bob), demo-invite (USER : Invité)"
} > "$cred")

echo
echo "Reset terminé en ${elapsed} s."
echo "  Adresse : http://localhost:$FRONTEND_PORT"
echo "  Comptes : demo-admin (administrateur), demo-famille (profils Alice et Bob), demo-invite (profil Invité)"
echo "  Mot de passe de démonstration (le même pour les trois) : $demo_password"
echo "  Enregistré dans homeflix/$cred (droits 600). À ne jamais réutiliser en production."
