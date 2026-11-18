#!/bin/bash
# Réglages de sécurité et de partage de Transmission, appliqués à CHAQUE démarrage du conteneur.
#
# L'image linuxserver exécute les scripts de /custom-cont-init.d (en root) juste avant de lancer le
# démon. Transmission réécrit settings.json à l'arrêt : on ne peut donc pas le monter en lecture
# seule ; on corrige les valeurs avec jq à chaque démarrage (idempotent, sans effet si déjà bonnes).
#
# Variables (voir compose.yaml et .env.example), toutes avec une valeur par défaut :
#   TRANSMISSION_DHT, TRANSMISSION_PEX   true/false  découverte de pairs (DHT, échange de pairs) ; false par défaut :
#                                        les trackers suffisent (mesuré : 38 s sans, 45 s avec) ; plan B si un tracker tombe
#   TRANSMISSION_LIMIT_UP                ko/s        débit d'envoi maximal (0 = illimité)
#   TRANSMISSION_LIMIT_DOWN              ko/s        débit de réception maximal (0 = illimité)
set -euo pipefail

SETTINGS=/config/settings.json
[ -f "$SETTINGS" ] || { echo "[homeflix] $SETTINGS introuvable"; exit 1; }

# On réécrit le fichier en conservant son propriétaire (Transmission tourne sous PUID, ce script sous root).
set_json() { # filtre jq [options jq...]
  local filter="$1"; shift
  jq "$@" "$filter" "$SETTINGS" > "$SETTINGS.tmp" && cat "$SETTINGS.tmp" > "$SETTINGS" && rm -f "$SETTINGS.tmp"
}

# Ce que Transmission pourrait faire d'inattendu : lancer un script, surveiller un dossier, ouvrir le routeur.
set_json '.["script-torrent-done-enabled"] = false
        | .["script-torrent-added-enabled"] = false
        | .["watch-dir-enabled"] = false
        | .["port-forwarding-enabled"] = false
        | .["lpd-enabled"] = false'

# Découverte de pairs.
set_json '.["dht-enabled"] = $dht | .["pex-enabled"] = $pex' \
  --argjson dht "${TRANSMISSION_DHT:-false}" --argjson pex "${TRANSMISSION_PEX:-false}"

# Pas de partage prolongé : on s'arrête dès que le fichier est complet (ratio 0), et l'envoi pendant le
# téléchargement est plafonné. (Un plafond trop bas ralentit la réception : les pairs favorisent ceux qui envoient.)
set_json '.["ratio-limit-enabled"] = true | .["ratio-limit"] = 0
        | .["idle-seeding-limit-enabled"] = false'

up="${TRANSMISSION_LIMIT_UP:-200}"
down="${TRANSMISSION_LIMIT_DOWN:-10000}"
set_json '.["speed-limit-up-enabled"] = ($up > 0) | .["speed-limit-up"] = (if $up > 0 then $up else .["speed-limit-up"] end)
        | .["speed-limit-down-enabled"] = ($down > 0) | .["speed-limit-down"] = (if $down > 0 then $down else .["speed-limit-down"] end)' \
  --argjson up "$up" --argjson down "$down"

echo "[homeflix] Transmission configuré : DHT=${TRANSMISSION_DHT:-false} PEX=${TRANSMISSION_PEX:-false} envoi=${up} ko/s réception=${down} ko/s, arrêt du partage à la fin"
