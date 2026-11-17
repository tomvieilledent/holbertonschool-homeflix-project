# Médias de démonstration et licences

Ce document décrit les films utilisés pour démontrer HomeFlix, leur licence, la preuve de nos droits et la façon de les récupérer. **Les fichiers vidéo ne sont pas committés** : ils se téléchargent avec un script qui vérifie leur intégrité.

> Dernière vérification des sources : 2026-11-16. Les extraits de licence cités ci-dessous viennent des pages officielles de Blender. Avant la soutenance, rouvrir les pages et conserver une capture (voir « Preuves à conserver »).

## Pourquoi deux films

Un seul titre ne permet pas de démontrer la recherche par titre, le filtre par genre, ni des favoris et une progression séparés entre deux profils. Les deux films sont de genres différents (fantastique et comédie familiale) et de durées différentes.

## Les films

| | *Sintel* (2010) | *Big Buck Bunny* (2008) |
|---|---|---|
| Genre | Fantastique, animation | Comédie familiale, animation |
| Auteur | Blender Foundation (projet Durian) | Blender Foundation (projet Peach) |
| Licence | Creative Commons Attribution 3.0 (CC BY 3.0) | Creative Commons Attribution 3.0 (CC BY 3.0) |
| Page officielle (licence) | https://durian.blender.org/about/ | https://peach.blender.org/about/ |
| Page officielle (attribution) | https://durian.blender.org/sharing/ | https://peach.blender.org/about/ |
| Page officielle (téléchargement) | https://durian.blender.org/download/ | https://peach.blender.org/download/ |
| Fichier source | `sintel-1024-surround.mp4` (« Original render, 2k cinema release version ») | `BigBuckBunny_640x360.m4v.zip` |
| URL de téléchargement | http://peach.themazzone.com/durian/movies/sintel-1024-surround.mp4 (miroir listé sur la page officielle) | https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_640x360.m4v.zip (site officiel) |
| Taille du fichier téléchargé | 129 241 752 octets | 121 284 117 octets |
| SHA-256 du fichier téléchargé | `1dc6f2ca9762dfcc7d1b1843129a3e4f351d1fe935dea2241c7b359c11ebc1d8` | `7118242b6728d40c871479c5b3c0f0fb27d748089df15d7f1b469f297c74a2d6` |
| Fichier produit | `sintel-2010-1024.mp4` | `big-buck-bunny-2008-640.mp4` |

Texte de la licence : https://creativecommons.org/licenses/by/3.0/. Les sommes SHA-256 ont été calculées le 2026-11-16.

## Droits : reproduction et redistribution

Le sujet exige de vérifier à la fois la **reproduction** et la **redistribution**. Les pages officielles indiquent :

- Les deux films sont « licensed under the Creative Commons Attribution 3.0 license ».
- « You can freely reuse and distribute this content, also commercially, for as long you provide a proper attribution. » (pages officielles de Blender)
- Pour une rediffusion du film entier : conserver le générique complet, qui est inclus dans les fichiers.

Conclusion : la reproduction (copie sur le serveur de démonstration, lecture) et la redistribution (partage pair-à-pair, voir issue #46) sont permises, à condition de **citer l'attribution** et de **conserver le générique**.

> Cette conclusion s'applique à ces deux films. Elle ne dispense pas de vérifier les droits de tout autre fichier utilisé dans HomeFlix.

## Attributions à afficher

> *Sintel* © copyright Blender Foundation | durian.blender.org, licence CC BY 3.0.
>
> *Big Buck Bunny* (c) copyright 2008, Blender Foundation / www.bigbuckbunny.org, licence CC BY 3.0.

Elles figurent dans cette documentation et doivent apparaître à l'écran de démonstration (page de détail de chaque film) et dans la note de droits d'auteur (issue #100).

## Modification

Chaque fichier est **remuxé** sans réencodage (`ffmpeg -c copy -movflags +faststart`) pour placer ses métadonnées au début du fichier, ce qui permet de lire et de se déplacer dans la vidéo avant la fin du téléchargement (utile pour HTTP Range). Les flux vidéo et audio restent identiques à ceux de la source. Pour *Big Buck Bunny*, le fichier est en plus extrait de son archive zip.

## Caractéristiques techniques

Mesurées avec `ffprobe` sur les fichiers téléchargés :

| Élément | Sintel | Big Buck Bunny |
|---|---|---|
| Conteneur | MP4 | MP4 (extension `.m4v` à la source) |
| Vidéo | H.264 High, 1024×436, `yuv420p` | H.264 Constrained Baseline, 640×359 |
| Audio | AAC-LC, 48 kHz, 6 canaux (5.1) | AAC-LC, 44,1 kHz, stéréo |
| Durée | 888 s (14 min 48 s) | 596 s (9 min 56 s) |
| Taille après remux | ≈ 129 Mo | ≈ 121 Mo |
| Métadonnées (`moov`) | à la fin à la source, au début après remux | déjà au début |

C'est le format supporté par HomeFlix : **MP4 H.264 / AAC**.

## Obtenir les fichiers

```bash
./homeflix/scripts/fetch-demo-media.sh
```

Le script télécharge chaque source, **vérifie son SHA-256**, extrait l'archive si besoin, remuxe avec `faststart`, vérifie les codecs, et dépose les fichiers dans `homeflix/demo-media/`. Un fichier déjà présent est ignoré. Prérequis : `curl`, `unzip`, `ffmpeg`, `ffprobe`, `sha256sum`. Le dossier `homeflix/demo-media/` est ignoré par Git.

## Limites et points d'attention

- **Sintel : le miroir est un site tiers.** Le MP4 n'est pas hébergé sur `download.blender.org` (qui propose du MKV) mais sur un miroir cité par la page officielle. Deux autres miroirs listés étaient injoignables ou en erreur 404 le 2026-11-16. L'intégrité est garantie par le SHA-256 que nous avons calculé, non par une somme officielle de Blender. Plan B : télécharger le MKV officiel (`https://download.blender.org/durian/movies/`, somme MD5 fournie) et le convertir en MP4 H.264/AAC avec `ffmpeg`.
- **Big Buck Bunny** est téléchargé depuis le site officiel de Blender ; la page de téléchargement indique elle-même que ses liens datent de 2008 et peuvent avoir expiré. Le lien était valide le 2026-11-16.
- L'audio de Sintel est en 5.1 : certains navigateurs ou appareils le rabattent en stéréo. Le son a été vérifié sur la machine de développement ; à contrôler sur chaque machine de démonstration avant la soutenance.
- Ces fichiers servent à la **lecture locale**. Le fichier du **téléchargement pair-à-pair** de la démo est distinct et documenté dans l'issue #46.

## Preuves conservées

Captures datées du 2026-11-16, dans [`evidence/`](evidence/). Chaque capture montre l'URL de la page officielle.

| Film | Preuve | Fichier |
|---|---|---|
| Sintel | Licence CC BY 3.0 (« you can share and show the movie freely, for as long you include the credit scroll ») | [2026-11-16_sintel-about.png](evidence/2026-11-16_sintel-about.png) |
| Sintel | Licence, redistribution autorisée (« freely reuse and distribute this content, also commercially ») et attribution | [2026-11-16_sintel-sharing.png](evidence/2026-11-16_sintel-sharing.png) |
| Sintel | Lien du fichier MP4 utilisé (1024 × 436, 123 Mo) | [2026-11-16_sintel-download.png](evidence/2026-11-16_sintel-download.png) |
| Big Buck Bunny | Licence CC BY 3.0, redistribution autorisée et cas d'attribution | [2026-11-16_bbb-about.png](evidence/2026-11-16_bbb-about.png) |
| Big Buck Bunny | Page de téléchargement : dossier officiel utilisé, badge CC BY | [2026-11-16_bbb-download.png](evidence/2026-11-16_bbb-download.png) |

Vérifications de lecture (Chrome et Firefox sous Windows, avec le son et le déplacement dans la vidéo) :

| Film | Chrome | Firefox |
|---|---|---|
| Sintel | [capture](evidence/2026-11-16_playback-sintel-chrome.png) | [capture](evidence/2026-11-16_playback-sintel-firefox.png) |
| Big Buck Bunny | [capture](evidence/2026-11-16_playback-bbb-chrome.png) | [capture](evidence/2026-11-16_playback-bbb-firefox.png) |
