#!/bin/bash
# Audit de sécurité de la pile HomeFlix démarrée : checklist automatique (montages, utilisateurs, ports, réseaux,
# secrets, durcissement) et, en option, analyse Trivy (images, dépendances, Dockerfiles). Rapport : docs/SECURITY_AUDIT.md.
#
#   ./scripts/security-audit.sh            # checklist seule (rapide, déterministe, lancée par la CI)
#   ./scripts/security-audit.sh --trivy    # checklist + Trivy (Internet requis ; compter une dizaine de minutes)
#
# Code de sortie : 0 si tout est conforme, 1 sinon. Pour Trivy, seule une vulnérabilité CRITIQUE absente de
# homeflix/.trivyignore fait échouer l'audit ; les vulnérabilités HAUTES sont affichées à titre d'information.
# Trivy n'est pas lancé par la CI : les vulnérabilités connues changent chaque jour, un audit vert hier peut être rouge demain.
# Prérequis : la pile démarrée (docker compose up -d), Docker ; pour Trivy : accès à l'image aquasec/trivy.
# Pour une pile de test : COMPOSE_PROJECT_NAME=autre-nom ./scripts/security-audit.sh
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

with_trivy=0
case "${1:-}" in
  -h | --help) sed -n '2,12p' "$0"; exit 0 ;;
  --trivy) with_trivy=1 ;;
  "") ;;
  *) echo "Option inconnue : $1 (voir --help)" >&2; exit 2 ;;
esac

TRIVY_IMAGE="aquasec/trivy:0.65.0"   # version épinglée : le rapport reste comparable d'un audit à l'autre
fails=0
pass() { printf '  [OK]   %s\n' "$1"; }
fail() { printf '  [FAIL] %s\n' "$1"; fails=$((fails + 1)); }
check() { if eval "$2" > /dev/null 2>&1; then pass "$1"; else fail "$1"; fi; }

cid() { docker compose ps -q "$1" 2> /dev/null; }
insp() { docker inspect -f "$2" "$(cid "$1")" 2> /dev/null; }   # service, modèle Go
dc_exec() { docker compose exec -T "$@" 2> /dev/null; }

services=(db identity-service library-service acquisition-service transmission frontend)
hardened=(identity-service library-service acquisition-service frontend)
for s in "${services[@]}"; do
  [ -n "$(cid "$s")" ] || { echo "Le service $s n'est pas démarré : lancez d'abord « docker compose up -d »." >&2; exit 1; }
done

mount_ro() { # service destination : vrai si le montage existe et est en lecture seule
  [ "$(insp "$1" "{{range .Mounts}}{{if eq .Destination \"$2\"}}{{.RW}}{{end}}{{end}}")" = false ]
}

echo "== 1. Montages"
check "Library lit /media en lecture seule" 'mount_ro library-service /media'
check "Library lit /downloads en lecture seule" 'mount_ro library-service /downloads'
check "les scripts d'initialisation de la base sont en lecture seule" 'mount_ro db /docker-entrypoint-initdb.d'
check "le script d'initialisation de Transmission est en lecture seule" 'mount_ro transmission /custom-cont-init.d/10-homeflix.sh'
check "Identity et le frontend n'ont aucun montage" '[ -z "$(insp identity-service "{{.Mounts}}" | tr -d "[]")" ] && [ -z "$(insp frontend "{{.Mounts}}" | tr -d "[]")" ]'
sock=0
priv=0
for s in "${services[@]}"; do
  insp "$s" '{{range .Mounts}}{{.Source}} {{end}}' | grep -q docker.sock && sock=1
  insp "$s" '{{.HostConfig.Privileged}}' | grep -q true && priv=1
  [ "$(insp "$s" '{{.HostConfig.NetworkMode}}')" = host ] && priv=1
  [ -n "$(insp "$s" '{{.HostConfig.PidMode}}')" ] && priv=1
done
[ "$sock" = 0 ] && pass "aucun conteneur ne monte docker.sock" || fail "un conteneur monte docker.sock"
[ "$priv" = 0 ] && pass "aucun conteneur privilégié, en réseau « host » ou dans l'espace de processus de l'hôte" \
  || fail "un conteneur est privilégié, en réseau « host » ou dans l'espace de processus de l'hôte"

echo "== 2. Utilisateurs (aucun service ne tourne en root)"
for s in db identity-service library-service acquisition-service frontend; do
  uid="$(dc_exec "$s" sh -c 'awk "/^Uid:/ {print \$2}" /proc/1/status' | tr -d '\r')"
  [ -n "$uid" ] && [ "$uid" != 0 ] && pass "$s : processus principal en UID $uid" || fail "$s : processus principal en root (UID ${uid:-inconnu})"
done
tuser="$(dc_exec transmission sh -c "ps -eo user,comm | grep transmission-da | awk '{print \$1}'" | tr -d '\r' | head -1)"
if [ -n "$tuser" ] && [ "$tuser" != root ]; then
  pass "transmission : le démon BitTorrent tourne sous « $tuser » (l'init de l'image démarre en root puis abandonne ses privilèges)"
else
  fail "transmission : le démon BitTorrent tourne en root (${tuser:-introuvable})"
fi

echo "== 3. Ports publiés sur l'hôte (seul le frontend)"
published=""
for s in "${services[@]}"; do
  [ -n "$(docker port "$(cid "$s")" 2> /dev/null)" ] && published="$published$s "
done
[ "$published" = "frontend " ] && pass "seul le frontend publie un port" || fail "services qui publient un port : ${published:-aucun}"

echo "== 4. Réseaux (Transmission isolé)"
nets() { insp "$1" '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}'; }
if [ "$(nets transmission | tr -s ' ' '\n' | grep -c .)" = 1 ] && nets transmission | grep -q '_torrent'; then
  pass "Transmission est uniquement sur le réseau « torrent »"
else
  fail "Transmission n'est pas isolé sur le seul réseau « torrent » : $(nets transmission)"
fi
for s in db identity-service library-service frontend; do
  nets "$s" | grep -q '_torrent' && fail "$s est sur le réseau « torrent »" || pass "$s n'est pas sur le réseau « torrent »"
done
nets acquisition-service | grep -q '_torrent' && pass "Acquisition (le seul client de Transmission) est sur le réseau « torrent »" || fail "Acquisition n'atteint pas Transmission"

echo "== 5. Secrets (chaque conteneur ne reçoit que les siens ; seuls les NOMS sont affichés)"
secret_names() { # service : noms des variables sensibles, triés
  insp "$1" '{{range .Config.Env}}{{println .}}{{end}}' | grep -E '^[A-Za-z0-9_]*(PASS|PASSWORD|SECRET|TOKEN|KEY)[A-Za-z0-9_]*=' | cut -d= -f1 | sort | tr '\n' ' '
}
expect_secrets() { # service noms attendus
  local got; got="$(secret_names "$1")"
  [ "$got" = "$2" ] && pass "$1 ne reçoit que : ${2:-aucun secret}" || fail "$1 reçoit « ${got:-rien} » au lieu de « ${2:-rien} »"
}
expect_secrets identity-service "DB_PASSWORD INTERNAL_API_KEY JWT_PRIVATE_KEY_BASE64 SETUP_TOKEN "
expect_secrets library-service "DB_PASSWORD INTERNAL_API_KEY STREAM_TICKET_SECRET "
expect_secrets acquisition-service "DB_PASSWORD INTERNAL_API_KEY TRANSMISSION_PASS "
expect_secrets db "ACQUISITION_DB_PASSWORD IDENTITY_DB_PASSWORD LIBRARY_DB_PASSWORD POSTGRES_PASSWORD "
expect_secrets transmission "PASS "
expect_secrets frontend ""
for s in identity-service library-service acquisition-service frontend; do
  img="$(insp "$s" '{{.Image}}')"
  n="$(docker image inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$img" | grep -cE '^[A-Za-z0-9_]*(PASS|PASSWORD|SECRET|TOKEN|PRIVATE)[A-Za-z0-9_]*=')"
  [ "$n" = 0 ] && pass "l'image de $s ne contient aucune variable secrète" || fail "l'image de $s contient $n variable(s) secrète(s)"
done

echo "== 6. Durcissement (services Java et frontend)"
for s in "${hardened[@]}"; do
  check "$s : toutes les capacités Linux retirées" '[ "$(insp "$s" "{{.HostConfig.CapDrop}}")" = "[ALL]" ] && [ "$(dc_exec "$s" sh -c "grep CapEff /proc/1/status" | tr -d "\r" | awk "{print \$2}")" = 0000000000000000 ]'
  check "$s : élévation de privilèges interdite (no-new-privileges)" '[ "$(insp "$s" "{{.HostConfig.SecurityOpt}}")" = "[no-new-privileges:true]" ]'
  check "$s : système de fichiers en lecture seule (écriture refusée hors /tmp)" '[ "$(insp "$s" "{{.HostConfig.ReadonlyRootfs}}")" = true ] && ! dc_exec "$s" sh -c "touch /usr/x-audit"'
done

if [ "$with_trivy" = 1 ]; then
  echo "== 7. Trivy ($TRIVY_IMAGE) : seule une vulnérabilité CRITIQUE non justifiée (homeflix/.trivyignore) fait échouer"
  trivy() { docker run --rm -v homeflix-trivy-cache:/root/.cache -v /var/run/docker.sock:/var/run/docker.sock -v "$PWD":/src:ro "$TRIVY_IMAGE" "$@"; }
  images="$(for s in "${services[@]}"; do insp "$s" '{{.Config.Image}}'; done | sort -u)"
  for img in $images; do
    out="$(trivy image --quiet --skip-version-check --ignorefile /src/.trivyignore --severity HIGH,CRITICAL "$img" 2> /dev/null)"
    # Une ligne « Total: N (HIGH: x, CRITICAL: y) » par cible (système, bibliothèques Java…) : on additionne.
    crit="$(echo "$out" | grep '^Total:' | sed -n 's/.*CRITICAL: \([0-9]*\).*/\1/p' | awk '{n += $1} END {print n + 0}')"
    high="$(echo "$out" | grep '^Total:' | sed -n 's/.*HIGH: \([0-9]*\).*/\1/p' | awk '{n += $1} END {print n + 0}')"
    if [ "$crit" = 0 ]; then
      pass "$img : aucune vulnérabilité critique non justifiée ($high haute(s) à titre d'information)"
    else
      fail "$img : $crit vulnérabilité(s) critique(s) non justifiée(s) ($high haute(s))"
    fi
  done
  if trivy fs --quiet --skip-version-check --scanners vuln --skip-dirs node_modules,target --ignorefile /src/.trivyignore --severity CRITICAL --exit-code 1 /src > /dev/null 2>&1; then
    pass "dépendances Maven et npm (pom.xml, package-lock.json) : aucune vulnérabilité critique"
  else
    fail "dépendances Maven ou npm : vulnérabilité(s) critique(s)"
  fi
  if trivy config --quiet --skip-version-check --severity MEDIUM,HIGH,CRITICAL --exit-code 1 /src > /dev/null 2>&1; then
    pass "Dockerfiles : aucune mauvaise configuration (Trivy config)"
  else
    fail "Dockerfiles : mauvaise(s) configuration(s) détectée(s) (Trivy config)"
  fi
fi

echo
if [ "$fails" -eq 0 ]; then echo "Audit de sécurité : TOUT EST CONFORME"; else echo "Audit de sécurité : $fails écart(s)"; exit 1; fi
