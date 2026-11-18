#!/bin/bash
# Sauvegarde des données persistantes de HomeFlix : un export (pg_dump) de chacune des 3 bases (comptes, catalogue,
# progression, favoris, téléchargements…) dans une archive horodatée.
#
#   ./scripts/backup.sh                       # écrit backups/homeflix-backup-AAAAMMJJ-HHMMSS.tar.gz
#   BACKUP_DIR=/mnt/disque ./scripts/backup.sh
#   ./scripts/backup.sh --prefix pre-restore  # change le début du nom de l'archive
#
# Ce que l'archive contient : les 3 bases (identity, library, acquisition), un manifeste (date, nombre de lignes par table)
# et les sommes SHA-256 pour détecter une archive abîmée. Ce qu'elle NE contient PAS :
#   - les médias (la bibliothèque de l'utilisateur, montée en lecture seule : sa propre sauvegarde est de son ressort) ;
#   - les fichiers téléchargés (re-téléchargeables depuis le catalogue) ni l'état de Transmission ;
#   - le fichier .env et ses secrets : inutile pour restaurer (une nouvelle pile génère les siens), donc jamais copié.
# L'archive contient des DONNÉES PERSONNELLES (comptes, mots de passe hachés, historique de visionnage) : droits 600,
# dossier 700 ; ne la committez pas et ne la partagez pas.
#
# Prérequis : la pile est démarrée (docker compose up -d), au moins la base de données.
set -euo pipefail
# Chemin absolu du dossier des scripts, calculé AVANT le cd : $0 est relatif au dossier de départ de l'appelant.
script_dir="$(cd "$(dirname "$0")" && pwd)" || exit 1
self="$script_dir/$(basename "$0")"
cd "$script_dir/.." || exit 1
umask 077

DATABASES=(identity library acquisition)
BACKUP_DIR="${BACKUP_DIR:-backups}"
prefix="homeflix-backup"

while [ $# -gt 0 ]; do
  case "$1" in
    --prefix) [ $# -ge 2 ] || { echo "--prefix attend une valeur." >&2; exit 2; }; prefix="$2"; shift 2 ;;
    -h|--help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$self"; exit 0 ;;
    *) echo "Option inconnue : $1 (voir --help)." >&2; exit 2 ;;
  esac
done
[[ "$prefix" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "Le préfixe ne peut contenir que des lettres, chiffres, point, tiret et souligné." >&2; exit 2; }

dc() { docker compose "$@"; }

# La base doit tourner et accepter les connexions.
if ! dc exec -T db pg_isready -U postgres -q 2> /dev/null; then
  echo "La base de données ne répond pas. Démarrez la pile (docker compose up -d) puis relancez la sauvegarde." >&2
  exit 1
fi

row_counts() { # base -> lignes « table=nombre » pour chaque table du schéma public (comptage exact)
  dc exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d "$1" -tAq -c "
    SELECT table_name || '=' || (xpath('/row/c/text()',
             query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
    FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
}

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

stamp="$(date +%Y%m%d-%H%M%S)"
name="${prefix}-${stamp}.tar.gz"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
target="$BACKUP_DIR/$name"
[ ! -e "$target" ] || { echo "$target existe déjà : réessayez dans une seconde." >&2; exit 1; }

echo "== Export des bases"
{
  echo "homeflix-backup-format=1"
  echo "created_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "postgres=$(dc exec -T db psql -U postgres -d postgres -tAq -c 'show server_version')"
} > "$work/manifest.txt"
for db in "${DATABASES[@]}"; do
  # --no-owner --no-acl : l'archive ne dépend pas des rôles de la pile d'origine (la restauration les recrée).
  dc exec -T db pg_dump -U postgres -d "$db" -Fc --no-owner --no-acl > "$work/$db.dump"
  [ -s "$work/$db.dump" ] || { echo "L'export de la base $db est vide : abandon." >&2; exit 1; }
  {
    echo "[$db]"
    echo "flyway_version=$(dc exec -T db psql -U postgres -d "$db" -tAq -c "select coalesce(max(installed_rank), 0) from flyway_schema_history")"
    row_counts "$db"
  } >> "$work/manifest.txt"
  echo "  $db : $(du -h "$work/$db.dump" | cut -f1)"
done
(cd "$work" && sha256sum manifest.txt "${DATABASES[@]/%/.dump}" > SHA256SUMS)

echo "== Archive"
tmp_target="$target.partial"
tar -czf "$tmp_target" -C "$work" manifest.txt SHA256SUMS "${DATABASES[@]/%/.dump}"
mv "$tmp_target" "$target"        # l'archive n'apparaît sous son vrai nom que lorsqu'elle est complète
chmod 600 "$target"

echo
echo "Sauvegarde créée : $target ($(du -h "$target" | cut -f1))"
echo "Elle contient des données personnelles : gardez-la hors du dépôt Git et hors de portée des autres utilisateurs."
echo "Pour restaurer : ./scripts/restore.sh $target"
