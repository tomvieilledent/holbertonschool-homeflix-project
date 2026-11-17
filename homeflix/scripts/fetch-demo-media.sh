#!/bin/bash
# Télécharge les films de démonstration (Blender Foundation, licence CC BY 3.0),
# vérifie leur intégrité, les remuxe avec les métadonnées au début (faststart)
# et les dépose dans homeflix/demo-media/. Sources et licences : docs/legal/DEMO_MEDIA.md
# Prérequis : curl, unzip, ffmpeg, ffprobe, sha256sum.
set -euo pipefail

cd "$(dirname "$0")/.."
OUT_DIR="demo-media"

for cmd in curl unzip ffmpeg ffprobe sha256sum; do
  command -v "$cmd" >/dev/null || { echo "Commande manquante : $cmd" >&2; exit 1; }
done

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT_DIR"

# fetch_film <nom de sortie> <url> <sha256 du fichier téléchargé> [fichier à extraire du zip]
fetch_film() {
  local out="$OUT_DIR/$1" url="$2" sha="$3" inner="${4:-}"
  local dl="$TMP/$1.download" src

  if [ -e "$out" ]; then
    echo "$out existe déjà, ignoré (supprimez-le pour le recréer)."
    return 0
  fi

  echo "Téléchargement de $1…"
  curl -fL --retry 3 -sS -o "$dl" "$url"

  echo "Vérification de l'intégrité…"
  echo "$sha  $dl" | sha256sum -c -

  if [ -n "$inner" ]; then
    unzip -q -o "$dl" "$inner" -d "$TMP/$1.unzipped"
    src="$TMP/$1.unzipped/$inner"
  else
    src="$dl"
  fi

  echo "Remux avec faststart (aucun réencodage)…"
  ffmpeg -v error -y -i "$src" -map 0 -c copy -movflags +faststart -f mp4 "$out"

  local codecs
  codecs="$(ffprobe -v error -show_entries stream=codec_name -of csv=p=0 "$out" | tr '\n' ' ')"
  case "$codecs" in
    *h264*aac*|*aac*h264*) echo "OK : $codecs" ;;
    *) echo "Codecs inattendus : $codecs" >&2; rm -f "$out"; exit 1 ;;
  esac
}

# Sintel (2010) — miroir listé sur https://durian.blender.org/download/
fetch_film sintel-2010-1024.mp4 \
  "http://peach.themazzone.com/durian/movies/sintel-1024-surround.mp4" \
  "1dc6f2ca9762dfcc7d1b1843129a3e4f351d1fe935dea2241c7b359c11ebc1d8"

# Big Buck Bunny (2008) — site officiel download.blender.org (archive zip)
fetch_film big-buck-bunny-2008-640.mp4 \
  "https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_640x360.m4v.zip" \
  "7118242b6728d40c871479c5b3c0f0fb27d748089df15d7f1b469f297c74a2d6" \
  "BigBuckBunny_640x360.m4v"

echo "Films prêts dans homeflix/$OUT_DIR/"
