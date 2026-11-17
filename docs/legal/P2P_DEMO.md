# Fichier de démonstration pour le téléchargement pair-à-pair (P2P)

Ce document établit les droits et la disponibilité du fichier utilisé pour démontrer le téléchargement BitTorrent de HomeFlix (issue #46). Il complète [`DEMO_MEDIA.md`](DEMO_MEDIA.md), qui traite de la lecture locale des deux films de démonstration.

> **Dernière vérification : 2026-11-17.** Les pages officielles, le nombre de seeders et le téléchargement doivent être **revérifiés la veille et le matin de la soutenance** (voir « Avant la soutenance »).

## En bref

- **Fichier retenu : *Sintel* (2010), `Sintel.mp4`**, publié en torrent par WebTorrent (page « Free Torrents », torrents de domaine public et Creative Commons destinés aux tests).
- **Licence : Creative Commons Attribution 3.0 (CC BY 3.0)**, qui autorise explicitement la redistribution, y compris commerciale, avec attribution et conservation du générique.
- **Le fichier est identique à celui dont les droits sont déjà documentés** : même taille (129 241 752 octets) et même SHA-256 que le fichier de `DEMO_MEDIA.md`.
- **251 seeders** sur le tracker `tracker.opentrackr.org` le 2026-11-17.
- **Téléchargement de test réussi** avec un client externe (aria2), uniquement auprès de pairs BitTorrent : fichier complet en environ 1 min 05 s, intégrité vérifiée.

## Le torrent

| Élément | Valeur |
|---|---|
| Œuvre | *Sintel* (2010), Blender Foundation, projet Durian |
| Publié par | WebTorrent (https://webtorrent.io/free-torrents), qui republie un fichier de la Blender Foundation |
| Fichier `.torrent` | https://webtorrent.io/torrents/sintel.torrent |
| Nom du torrent | `Sintel` |
| **Infohash (SHA-1)** | `08ada5a7a6183aae1e09d831df6748d566095a10` |
| Taille de pièce | 131 072 octets |
| Contenu | `Sintel.mp4` (129 241 752 octets), `poster.jpg` (46 115 octets), 9 sous-titres `.srt` (≈ 1,5 à 2 Ko chacun) ; **total 129 302 391 octets (≈ 123 Mio)** |
| Trackers annoncés | `udp://tracker.opentrackr.org:1337`, `udp://explodie.org:6969`, `udp://tracker.leechers-paradise.org:6969`, `udp://tracker.coppersurfer.tk:6969`, `udp://tracker.empire-js.us:1337`, trois trackers `wss://` (WebTorrent) |
| Web seed | `https://webtorrent.io/torrents/` (déclaré dans le `.torrent`) |

L'infohash a été **recalculé par nous** à partir du fichier `.torrent` téléchargé (SHA-1 du dictionnaire `info`) : il correspond à celui de la page WebTorrent.

Lien magnet **sans web seed** (pour un test qui ne passe que par des pairs ; à ne stocker que côté serveur, voir « Utilisation dans HomeFlix ») :

```
magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.empire-js.us%3A1337&xs=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2Fsintel.torrent
```

## Droits : reproduction et redistribution

**Critère de l'issue : la licence autorise explicitement la redistribution.** Oui, d'après la Blender Foundation (pages officielles relues le 2026-11-17) :

| Source | Extrait | URL |
|---|---|---|
| Page « About » | « “Sintel” is licensed as Creative Commons Attribution 3.0. That means you can share and show the movie freely, for as long you include the credit scroll of the film itself. » | https://durian.blender.org/about/ |
| Page « Sharing » | « The results of the Durian Open Movie project are being licensed under the Creative Commons Attribution 3.0 license. » puis « you can freely reuse and distribute this content, also commercially, for as long you provide a proper attribution. » | https://durian.blender.org/sharing/ |
| Texte de la licence | CC BY 3.0 | https://creativecommons.org/licenses/by/3.0/ |

Captures datées du 2026-11-16 de ces mêmes pages : [`evidence/2026-11-16_sintel-about.png`](evidence/2026-11-16_sintel-about.png) et [`evidence/2026-11-16_sintel-sharing.png`](evidence/2026-11-16_sintel-sharing.png).

**Conditions à respecter :**
1. **Attribution** : « © copyright Blender Foundation | durian.blender.org ». Elle figure sur la page de détail du film dans HomeFlix et dans la note de droits d'auteur (#100).
2. **Générique conservé** : le fichier est diffusé entier, avec son générique (« include the entire credits scroll »). HomeFlix ne le coupe pas.
3. **Exclusions** : la page « Sharing » exclut de la licence les logos et marques de la Blender Foundation (et d'éventuels éléments signalés comme tiers). HomeFlix n'en utilise aucun.

**Pourquoi le fichier du torrent est bien celui dont on a les droits.** WebTorrent n'est pas l'ayant droit : sa page se contente de lister des torrents « de domaine public et Creative Commons, utiles pour les tests ». Ce n'est pas elle qui nous donne le droit, c'est la licence de la Blender Foundation. Il fallait donc prouver que le fichier reçu par BitTorrent est **le même** que celui de `DEMO_MEDIA.md`, dont la source et la licence sont documentées :

| | Fichier de `DEMO_MEDIA.md` | `Sintel.mp4` reçu par BitTorrent |
|---|---|---|
| Taille | 129 241 752 octets | 129 241 752 octets |
| SHA-256 | `1dc6f2ca9762dfcc7d1b1843129a3e4f351d1fe935dea2241c7b359c11ebc1d8` | `1dc6f2ca9762dfcc7d1b1843129a3e4f351d1fe935dea2241c7b359c11ebc1d8` |

Les deux sont identiques à l'octet près : le fichier P2P **est** le MP4 de Sintel de la Blender Foundation. (Journal : [`evidence/2026-11-17_p2p-download-aria2.log`](evidence/2026-11-17_p2p-download-aria2.log).)

> Cette conclusion ne vaut que pour ce fichier. Tout autre torrent ajouté au catalogue d'acquisition (#60) exige sa propre vérification de licence.

## Disponibilité : seeders

Relevé du 2026-11-17 18:23 UTC, par interrogation directe des trackers (`python3 homeflix/scripts/p2p-seeders.py`) :

| Tracker | Seeders | Leechers | Téléchargements terminés |
|---|---|---|---|
| `tracker.opentrackr.org:1337` | **251** | 87 | 7 914 |
| `explodie.org:6969` | 57 | 17 | 0 |
| `tracker.leechers-paradise.org:6969` | injoignable | | |
| `tracker.coppersurfer.tk:6969` | injoignable | | |

Deux trackers sur quatre ne répondent pas : c'est normal (trackers publics, certains sont hors service) et sans gravité tant qu'un seul répond. Les mêmes pairs sont aussi trouvés par la DHT. Preuve : [`evidence/2026-11-17_p2p-tracker-scrape.txt`](evidence/2026-11-17_p2p-tracker-scrape.txt).

À titre de comparaison, *Big Buck Bunny* (infohash `dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c`, 276 Mo) avait 444 seeders sur `tracker.opentrackr.org` : un second choix possible, mais deux fois plus lourd.

## Test de téléchargement hors projet

**Critère : le téléchargement de test aboutit.** Oui.

- **Client** : aria2 1.37.0, dans un conteneur `alpine` jetable. C'est un client **différent de Transmission** et sans lien avec le code de HomeFlix.
- **Torrent sans web seed** : j'ai retiré du `.torrent` l'entrée `url-list` (le serveur HTTP de WebTorrent). L'infohash n'a pas changé (il est calculé sur le seul dictionnaire `info`). Les données ne pouvaient donc venir **que de pairs BitTorrent** : un téléchargement HTTP déguisé aurait réussi même sans aucun seeder.
- **Commande** : `aria2c --seed-time=0 --enable-dht=true -d dl sintel-noweb.torrent`.
- **Résultat** (2026-11-17, lancement à 19:19:58 heure de Paris) :

| Mesure | Valeur |
|---|---|
| Délai avant le premier octet | **≈ 38 s** (recherche de pairs par les trackers et la DHT) |
| Pairs | 5 à 6 seeders connectés en même temps, 44 connexions au maximum |
| Débit | jusqu'à ≈ 6,7 Mio/s |
| Durée totale | **≈ 1 min 05 s** pour 123 Mio |
| Taille reçue | 129 241 752 octets pour `Sintel.mp4`, identique à la source |
| Intégrité | SHA-256 identique à `DEMO_MEDIA.md` (BitTorrent vérifie aussi chaque pièce par son empreinte) |

**À retenir pour la démonstration : il y a une attente de plusieurs dizaines de secondes avant que le transfert ne démarre.** L'écran d'acquisition doit afficher un état « démarrage / recherche de pairs » et non une erreur (voir #95).

**Limites du test.**
- Il a été fait depuis **un réseau domestique** (machine de développement sous WSL2). Il ne prouve rien pour le **réseau de la soutenance** (risque R12) : pare-feu, NAT et trackers filtrés peuvent tout bloquer. À retester sur place (voir ci-dessous).
- Le test porte sur le torrent seul, pas sur la chaîne HomeFlix (Acquisition, Transmission, volume `/downloads`, indexation par Library). Cette chaîne est l'objet de #61, #74 et du test de bout en bout #111.

## Utilisation dans HomeFlix

- **Le lien magnet n'est jamais envoyé au navigateur** : il reste côté serveur, dans le catalogue d'acquisition (#60). Les utilisateurs ne choisissent qu'un identifiant d'entrée du catalogue.
- **Le torrent contient 11 fichiers** (vidéo, affiche, sous-titres). Transmission les télécharge tous dans `/downloads/Sintel/`. Library n'indexe que les vidéos (`mp4`, `mkv`, `webm`) : l'affiche et les sous-titres sont ignorés.
- **Point à trancher en équipe : doublon avec le film de démonstration.** *Sintel* est aussi dans `homeflix/demo-media/` (lecture locale). Une fois le téléchargement terminé, Library verrait deux entrées « Sintel » (une sous `/media`, une sous `/downloads`). Choix possibles : ne pas mettre Sintel dans `demo-media/` pour la démonstration, utiliser *Big Buck Bunny* comme film P2P, ou accepter le doublon et l'expliquer. Voir aussi #73 (doublons).
- **Partage pendant le téléchargement** : le client BitTorrent renvoie aussi des morceaux aux autres pairs. C'est permis ici (licence CC BY, redistribution autorisée). Le client doit s'arrêter de partager une fois le fichier terminé (risque R10, #61).

## Plan B : si le téléchargement ne démarre pas

Le risque est réel (R11 : aucun pair ; R12 : réseau bloquant). Trois niveaux, du plus simple au plus sûr :

1. **Changer de réseau** : partage de connexion d'un téléphone (à tester avant : certains opérateurs bloquent le P2P).
2. **Seed local sur une seconde machine sous notre contrôle** : une machine qui a déjà téléchargé le torrent et reste en partage (par exemple `aria2c --seed-time=1440 -d dl sintel.torrent`, ou Transmission), sur le même réseau local que la machine de démonstration. Sur un réseau local, les clients se trouvent par la découverte de pairs locale (LPD) sans dépendre d'internet. **Statut : procédure non testée**, à valider sur deux machines réelles avant #111 et #125. Elle ne fonctionne pas entre deux conteneurs Docker sur des réseaux séparés.
3. **Preuve de repli** : fichier `Sintel.mp4` déjà présent sur la machine de démonstration, et capture vidéo d'un transfert réel déjà réussi (à enregistrer lors de #111).

## Avant la soutenance (veille et matin)

```bash
python3 homeflix/scripts/p2p-seeders.py            # au moins un tracker doit répondre avec des seeders
```

- [ ] Au moins un tracker répond, avec plus de 0 seeder.
- [ ] Une seule fois sur le réseau de la soutenance : lancer un téléchargement réel complet (via HomeFlix si #111 est fait, sinon avec un client externe).
- [ ] Rouvrir les pages de licence (liens ci-dessus) et vérifier que le texte cité est toujours présent ; conserver une capture datée dans `evidence/`.
- [ ] Machine de démonstration : le fichier `Sintel.mp4` de repli est présent, plan B n° 2 prêt.

## Relecture

- [ ] Relu par un second développeur (critère de l'issue #46) : _à compléter lors de la relecture de la PR._
