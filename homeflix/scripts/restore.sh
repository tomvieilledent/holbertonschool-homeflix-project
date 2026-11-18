#!/bin/bash
# Restaure une sauvegarde créée par ./scripts/backup.sh : REMPLACE le contenu des 3 bases (comptes, catalogue, progression,
# favoris, téléchargements) par celui de l'archive. Les médias et les fichiers téléchargés ne sont ni touchés ni restaurés.
#
#   ./scripts/restore.sh backups/homeflix-backup-20261118-103000.tar.gz       # demande de taper RESTAURER
#   ./scripts/restore.sh <archive> --yes                                      # sans question (scripts, tests)
#   ./scripts/restore.sh <archive> --yes --no-safety-backup                   # sans sauvegarde de l'état actuel
#
# Sécurité :
#   - CONFIRMATION EXPLICITE obligatoire : taper RESTAURER, ou passer --yes. Sans terminal et sans --yes, le script refuse.
#   - L'archive est vérifiée (sommes SHA-256, lisibilité des exports) AVANT toute modification.
#   - L'état actuel est sauvegardé (pre-restore-...) avant d'être remplacé, sauf --no-safety-backup.
# Fonctionne sur une pile vierge : si la base de données n'est pas démarrée, le script la démarre (les volumes peuvent
# avoir été supprimés). Les services applicatifs sont arrêtés pendant la restauration, puis redémarrés.
# La restauration vers une version plus ancienne de HomeFlix (schéma plus récent que le code) est refusée par Flyway
# au démarrage : le message le dit clairement.
set -euo pipefail
# Chemin absolu du dossier des scripts, calculé AVANT le cd : $0 est relatif au dossier de départ de l'appelant.
script_dir="$(cd "$(dirname "$0")" && pwd)" || exit 1
self="$script_dir/$(basename "$0")"
cd "$script_dir/.." || exit 1
umask 077

DATABASES=(identity library acquisition)
archive=""
assume_yes=false
safety_backup=true

while [ $# -gt 0 ]; do
  case "$1" in
    --yes) assume_yes=true; shift ;;
    --no-safety-backup) safety_backup=false; shift ;;
    -h|--help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$self"; exit 0 ;;
    -*) echo "Option inconnue : $1 (voir --help)." >&2; exit 2 ;;
    *) [ -z "$archive" ] || { echo "Une seule archive à la fois." >&2; exit 2; }; archive="$1"; shift ;;
  esac
done
[ -n "$archive" ] || { echo "Usage : ./scripts/restore.sh <archive.tar.gz> [--yes] [--no-safety-backup]" >&2; exit 2; }
[ -f "$archive" ] || { echo "Archive introuvable : $archive" >&2; exit 1; }

dc() { docker compose "$@"; }
psql_db() { local db="$1"; shift; dc exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d "$db" -tAq "$@"; }

row_counts() {
  psql_db "$1" -c "
    SELECT table_name || '=' || (xpath('/row/c/text()',
             query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
    FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
}

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# --- 1. Vérifier l'archive AVANT de toucher à quoi que ce soit ---------------------------------------------------
echo "== Vérification de l'archive"
tar -xzf "$archive" -C "$work" 2> /dev/null || { echo "Archive illisible ou abîmée : $archive" >&2; exit 1; }
for f in manifest.txt SHA256SUMS "${DATABASES[@]/%/.dump}"; do
  [ -s "$work/$f" ] || { echo "Archive incomplète : $f manque." >&2; exit 1; }
done
(cd "$work" && sha256sum --quiet -c SHA256SUMS) || { echo "Les sommes SHA-256 ne correspondent pas : archive modifiée ou abîmée. Rien n'a été touché." >&2; exit 1; }
grep -q '^homeflix-backup-format=1$' "$work/manifest.txt" || { echo "Format d'archive inconnu." >&2; exit 1; }
echo "  créée le $(grep '^created_at=' "$work/manifest.txt" | cut -d= -f2) : sommes SHA-256 correctes"

# --- 2. Confirmation explicite --------------------------------------------------------------------------------------
echo
echo "ATTENTION : cette opération REMPLACE les comptes, le catalogue, la progression et les favoris actuels par ceux de"
echo "l'archive. Les données actuelles seront perdues$($safety_backup && echo ' (une sauvegarde de sécurité est faite avant)')."
if ! $assume_yes; then
  if [ ! -t 0 ]; then
    echo "Pas de terminal pour confirmer : relancez avec --yes pour confirmer explicitement. Rien n'a été modifié." >&2
    exit 1
  fi
  read -r -p "Pour continuer, tapez RESTAURER : " answer
  [ "$answer" = "RESTAURER" ] || { echo "Confirmation incorrecte : annulé. Rien n'a été modifié." >&2; exit 1; }
fi

# --- 3. La base doit tourner (pile vierge : on la démarre) -------------------------------------------------------
echo "== Base de données"
dc up -d --wait db > /dev/null

# --- 4. Sauvegarde de sécurité de l'état actuel (s'il y a quelque chose à perdre) -------------------------------------------
if $safety_backup; then
  existing="$(psql_db identity -c "select count(*) from information_schema.tables where table_schema = 'public'" || echo 0)"
  if [ "${existing:-0}" -gt 0 ]; then
    echo "== Sauvegarde de sécurité de l'état actuel"
    # Si la sauvegarde de sécurité échoue, on N'ÉCRASE RIEN : mieux vaut s'arrêter que perdre l'état actuel sans filet.
    if ! safety_output="$("$script_dir/backup.sh" --prefix pre-restore 2>&1)"; then
      echo "$safety_output" >&2
      echo "La sauvegarde de sécurité a échoué : restauration annulée, rien n'a été modifié (--no-safety-backup pour passer outre)." >&2
      exit 1
    fi
    echo "$safety_output" | grep -E "Sauvegarde créée" | sed 's/^/  /'
  else
    echo "== Pas d'état actuel à sauvegarder (pile vierge)"
  fi
fi

# --- 5. Arrêt des services pendant la restauration ----------------------------------------------------------------------
echo "== Arrêt des services"
dc stop frontend library-service acquisition-service identity-service > /dev/null 2>&1 || true

# --- 6. Restauration ----------------------------------------------------------------------------------------------
echo "== Restauration"
for db in "${DATABASES[@]}"; do
  # Schéma public recréé vide, propriété du rôle de la base : les tables restaurées appartiennent au rôle du service.
  psql_db "$db" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public AUTHORIZATION $db;" > /dev/null
  dc exec -T db pg_restore -U postgres -d "$db" --no-owner --no-acl --role="$db" --exit-on-error < "$work/$db.dump"
  echo "  $db restaurée"
done

# --- 7. Contrôle : le nombre de lignes de chaque table doit être celui du manifeste -----------------------------------------
echo "== Contrôle"
failed=false
for db in "${DATABASES[@]}"; do
  expected="$(sed -n "/^\[$db\]\$/,/^\[/p" "$work/manifest.txt" | grep '=' | grep -v '^flyway_version=' | sort)"
  actual="$(row_counts "$db" | sort)"
  if [ "$expected" = "$actual" ]; then
    echo "  $db : $(echo "$actual" | grep -c '=') tables, nombre de lignes identique à la sauvegarde"
  else
    echo "  $db : DIFFÉRENCE avec la sauvegarde" >&2; failed=true
  fi
done
$failed && { echo "La restauration ne correspond pas à l'archive : ne démarrez pas la pile avant de comprendre pourquoi." >&2; exit 1; }

# --- 8. Redémarrage ------------------------------------------------------------------------------------------------
echo "== Redémarrage de la pile"
if ! dc up -d --wait > /dev/null; then
  echo "La pile ne redémarre pas. Si l'archive vient d'une version plus récente de HomeFlix, Flyway refuse un schéma plus récent que le code :" >&2
  echo "mettez le code à la version de l'archive. Voir : docker compose logs identity-service library-service acquisition-service" >&2
  exit 1
fi
echo
echo "Restauration terminée : comptes, catalogue, progression et favoris sont ceux de l'archive."
