#!/bin/bash
# Vérifie qu'aucun secret n'est présent dans les fichiers suivis (ou à suivre) par Git.
#
#   ./homeflix/scripts/check-secrets.sh      # code de sortie 0 : rien trouvé ; 1 : problème
#
# Contrôles :
#   1. .env et les clés/certificats ne sont pas suivis par Git ; .env est bien ignoré.
#   2. .env.example ne contient aucune valeur secrète utilisable (uniquement CHANGE_ME).
#   3. Aucune clé privée (-----BEGIN ... PRIVATE KEY-----) dans les fichiers.
#   4. Aucune affectation « MOT_DE_PASSE / SECRET / TOKEN / CLE = valeur longue » (hors CHANGE_ME
#      et hors références ${VARIABLE}).
# Valeurs autorisées : le mot de passe factice du profil « dev » (dev-only-change-me), qui n'est
# pas une affectation de variable d'environnement.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

fails=0
ok()   { printf '  [OK]   %s\n' "$1"; }
fail() { printf '  [FAIL] %s\n' "$1"; fails=$((fails + 1)); }

echo "== Fichiers sensibles"
tracked=$(git ls-files | grep -E '(^|/)\.env$|(^|/)\.env\.[^/]+$|\.pem$|\.key$|\.p12$|\.jks$' | grep -v '\.env\.example$')
[ -z "$tracked" ] && ok "aucun .env, clé ou certificat suivi par Git" || fail "fichiers sensibles suivis : $(echo $tracked)"
git check-ignore -q homeflix/.env && ok ".env est ignoré par Git" || fail ".env n'est pas ignoré par Git"
git check-ignore -q homeflix/.env.example && fail ".env.example est ignoré (il doit être versionné)" || ok ".env.example est versionné"

echo "== .env.example"
bad=$(grep -E '^[A-Z0-9_]*(PASSWORD|PASS|SECRET|TOKEN|KEY)[A-Z0-9_]*=' homeflix/.env.example | grep -v '=CHANGE_ME$')
[ -z "$bad" ] && ok "toutes les variables secrètes valent CHANGE_ME" || fail "valeurs non fictives : $(echo "$bad" | cut -d= -f1 | tr '\n' ' ')"

echo "== Contenu des fichiers"
files=(':!package-lock.json' ':!*.png' ':!*.jpg' ':!*.jar')
keys=$(git grep --untracked -I -l -E -e '-----BEGIN [A-Z ]*PRIVATE KEY-----' -- . "${files[@]}" ':!homeflix/scripts/check-secrets.sh' 2>/dev/null)
[ -z "$keys" ] && ok "aucune clé privée dans les fichiers" || fail "clé privée trouvée dans : $(echo $keys)"
assign=$(git grep --untracked -I -n -E -e '(PASSWORD|PASS|SECRET|TOKEN|API_KEY|PRIVATE_KEY)[A-Z0-9_]*[:=][ ]*[A-Za-z0-9+/_=-]{16,}' -- . "${files[@]}" ':!homeflix/scripts/check-secrets.sh' 2>/dev/null \
  | grep -v -E 'CHANGE_ME|\$\{|\$\(|mvnw|MVNW|\.md:' )
[ -z "$assign" ] && ok "aucune affectation de secret avec une valeur en clair" || { fail "affectations suspectes :"; echo "$assign" | cut -c1-140; }

echo
if [ "$fails" -eq 0 ]; then echo "Contrôle des secrets : RIEN TROUVÉ"; else echo "Contrôle des secrets : $fails problème(s)"; exit 1; fi
