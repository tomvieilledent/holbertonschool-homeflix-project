# Droit d'auteur et P2P : note de sensibilisation

Cette note explique, simplement, ce que HomeFlix fait et ne fait pas en matière de droits d'auteur, et ce que l'administrateur doit savoir avant de télécharger un film en pair-à-pair (P2P). Elle sert aussi de texte de référence pour le rappel affiché avant le premier téléchargement.

> **Cette note n'est pas un avis juridique.** Les règles précises dépendent de votre pays et de chaque œuvre. En cas de doute sur un fichier : ne le téléchargez pas, ne le partagez pas.

## L'essentiel

1. **Le P2P n'accorde aucun droit.** C'est un moyen technique de transférer un fichier. Qu'un film soit disponible en P2P ne dit rien sur le droit de le télécharger ou de le partager.
2. **Un client BitTorrent partage automatiquement.** Pendant qu'il télécharge, il renvoie aussi à d'autres personnes les morceaux déjà reçus : **télécharger, c'est aussi diffuser.**
3. **N'utilisez que des contenus que vous avez le droit de copier et de redistribuer** : vos propres créations, ou des œuvres sous licence libre qui l'autorise explicitement (par exemple Creative Commons).
4. **HomeFlix ne fournit aucun film** et n'en cherche aucun. Le catalogue de téléchargement est **fermé** : seul l'administrateur y accède, et chaque entrée a une source et une licence documentées.
5. **Les films de démonstration** (*Sintel* et *Big Buck Bunny*) sont sous licence Creative Commons CC BY 3.0 : redistribution permise, à condition de citer l'auteur et de conserver le générique (section 7).

## 1. Ce que protège le droit d'auteur

Une œuvre (film, musique, livre…) appartient à ses auteurs ou à leurs ayants droit. Sans leur autorisation, on ne peut en principe ni **la copier** (reproduction), ni **la montrer au public** (représentation), ni **la mettre à disposition ou la distribuer**. Une **licence** est cette autorisation, écrite, avec ses conditions. Une licence libre comme la CC BY 3.0 autorise la copie et la redistribution, **à condition** de respecter ses conditions (ici : citer l'auteur).

Utiliser HomeFlix pour regarder, chez vous, des fichiers que vous possédez légitimement est un usage de foyer. Donner accès à des films protégés à des personnes extérieures au foyer, ou les publier, peut être une diffusion non autorisée.

## 2. Le P2P n'accorde aucun droit

BitTorrent permet à de nombreuses personnes de s'échanger un fichier sans serveur central : chacune reçoit et envoie des morceaux. Cela ne change rien au statut du contenu :

- **Un fichier présent sur un tracker ou dans un annuaire de torrents n'est pas pour autant autorisé.** Le nombre de personnes qui le partagent n'est pas une licence.
- **Le torrent n'est pas l'ayant droit.** Dans notre démonstration, le site WebTorrent publie un torrent de *Sintel* ; ce n'est pas lui qui nous donne le droit de le diffuser, c'est la licence de la Blender Foundation. Nous avons donc vérifié que le fichier reçu par BitTorrent est **identique à l'octet près** (même taille, même SHA-256) à celui dont la licence est documentée. Voir [`legal/P2P_DEMO.md`](legal/P2P_DEMO.md).
- **Un lien magnet ou un fichier `.torrent` ne contient pas l'œuvre** : il sert à la retrouver. Posséder le lien ne prouve rien sur les droits.

## 3. Le partage automatique des morceaux

Voici ce qui se passe quand l'administrateur lance un téléchargement :

1. HomeFlix demande à Transmission (le client BitTorrent, dans un conteneur isolé) de télécharger le contenu d'une entrée du catalogue.
2. Transmission contacte des **traceurs** (des serveurs qui listent les participants) et se connecte à d'autres pairs.
3. Il reçoit le fichier **par morceaux**, chacun vérifié par son empreinte.
4. **Pendant ce temps, il envoie aussi aux autres pairs les morceaux qu'il a déjà.** C'est le principe même de BitTorrent : on ne peut pas être sûr de recevoir sans donner.
5. Votre **adresse IP publique** est visible des traceurs et des autres pairs. Ce comportement est inhérent à BitTorrent ; HomeFlix ne la masque pas.

### Ce que HomeFlix règle pour limiter ce partage

Ces réglages sont appliqués à **chaque démarrage** du conteneur Transmission (voir [`init-settings.sh`](../homeflix/transmission/init-settings.sh)) :

| Réglage | Valeur | Effet |
|---|---|---|
| Arrêt du partage à la fin | Ratio limite **0** | Dès que le fichier est complet, Transmission **cesse de le partager**. Pas de « seed » prolongé. |
| Débit d'envoi pendant le téléchargement | **200 ko/s** par défaut (`TRANSMISSION_LIMIT_UP`) | L'envoi reste plafonné. Un plafond trop bas ralentit la réception, car les pairs favorisent ceux qui envoient. |
| Découverte de pairs sans serveur central (DHT) | **Désactivée** par défaut (`TRANSMISSION_DHT=false`) | Moins de pairs inconnus contactés ; les traceurs suffisent. À activer en plan B si aucun traceur ne répond. |
| Échange de pairs (PEX), découverte locale (LPD) | Désactivés | Idem. |
| Ouverture automatique du routeur (UPnP / NAT-PMP) | **Désactivée** | HomeFlix n'ouvre aucun port sur votre box. |
| Scripts et dossier surveillé | Désactivés | Transmission ne lance rien et n'ajoute rien de lui-même. |

De plus, **aucun port de Transmission n'est publié** sur la machine : personne, depuis l'extérieur, ne peut s'y connecter, ni utiliser son interface d'administration. Il se connecte lui-même à d'autres pairs.

Le réglage « ratio 0 » est contrôlé par le test de fumée à chaque modification du code. En revanche, nous n'avons pas observé l'arrêt effectif du partage sur un transfert réel de bout en bout (c'est l'objet du test #111).

**Ce qui reste vrai malgré ces réglages :** pendant un téléchargement, des morceaux sont bien envoyés à d'autres personnes. C'est acceptable pour un contenu dont la licence autorise la redistribution ; ce ne l'est pas pour un contenu protégé. **Les réglages réduisent le partage, ils ne remplacent pas la vérification de la licence.**

## 4. Ce que HomeFlix met en place pour éviter les abus

| Mesure | Détail |
|---|---|
| **Catalogue fermé** | Aucun champ de l'application ne permet de saisir une adresse ou un lien magnet. L'administrateur choisit une entrée du catalogue par son identifiant. |
| **Source et licence obligatoires** | Chaque entrée du catalogue a une source, une licence et une preuve de licence : la base de données **refuse** une entrée sans ces valeurs (contraintes `NOT NULL` et non-vide). |
| **Lien magnet côté serveur seulement** | Il n'est jamais envoyé au navigateur ni renvoyé par l'API. |
| **Magnet uniquement** | Le service refuse tout autre type de source (adresse web, chemin de fichier) : un client BitTorrent pourrait sinon atteindre le réseau interne (protection SSRF). |
| **Réservé à l'administrateur** | Le catalogue et les téléchargements exigent le rôle ADMIN. |
| **Un téléchargement actif par entrée** | Garanti par la base de données. |
| **Client isolé** | Transmission est sur un réseau privé que seul le service Acquisition partage. |
| **Rappel des droits à acquitter** | Avant le premier téléchargement, l'administrateur doit lire et acquitter le rappel de la section 5. La base enregistre cet acquittement (par compte et par version du texte). *État : la base et le contrat d'API sont prêts ; la route qui l'impose arrive avec l'issue #88.* |

**Ce que HomeFlix ne fait pas :** il ne vérifie pas lui-même la licence d'un fichier, ne reconnaît pas les contenus protégés et ne filtre rien dans vos propres dossiers. Le contrôle repose sur le **catalogue fermé** et sur **votre vérification**. Ajouter une entrée au catalogue se fait aujourd'hui dans la base ; toute nouvelle entrée exige sa propre vérification de licence.

## 5. Texte du rappel affiché avant le premier téléchargement (version `2026-11`)

> Vous êtes sur le point de télécharger un fichier par BitTorrent. Un client BitTorrent partage aussi avec d'autres personnes les morceaux qu'il a déjà reçus : télécharger, c'est aussi diffuser.
>
> Ne téléchargez que des contenus dont vous détenez les droits, ou dont la licence autorise la redistribution. Le catalogue de HomeFlix ne propose que de tels contenus, avec leur source et leur licence. Le fait qu'un fichier soit disponible en P2P ne signifie pas qu'il est autorisé.
>
> En continuant, vous confirmez avoir lu ce rappel et vous engagez à ne télécharger que des contenus que vous avez le droit de partager.

Ce texte est la **proposition de référence** pour le service Acquisition (route `GET /rights-notice`). Si on le modifie, il faut changer son numéro de version : chaque administrateur doit alors acquitter la nouvelle version.

## 6. Vos responsabilités d'administrateur

- Ne lancez de téléchargement que depuis le catalogue, et **vérifiez la licence** de toute entrée que vous y ajoutez (page officielle de l'auteur, texte de la licence, preuve conservée).
- N'indexez dans Library que des fichiers dont vous avez le droit.
- Ne donnez pas accès à votre HomeFlix à des personnes extérieures au foyer pour des films protégés. HomeFlix sert du HTTP simple et n'est pas fait pour être publié sur Internet.
- Conservez les **attributions** exigées par les licences libres (section 7).
- En cas de demande d'un ayant droit, retirez l'entrée (administration du catalogue) et supprimez le fichier.

Avant un téléchargement, trois questions : **D'où vient ce fichier ? Quelle licence l'autorise ? Ai-je gardé la preuve ?** Si une réponse manque, ne le téléchargez pas.

## 7. Films de démonstration : licence et attributions

| | *Sintel* (2010) | *Big Buck Bunny* (2008) |
|---|---|---|
| Auteur | Blender Foundation (projet Durian) | Blender Foundation (projet Peach) |
| Licence | Creative Commons Attribution 3.0 (CC BY 3.0) | Creative Commons Attribution 3.0 (CC BY 3.0) |
| Source officielle | https://durian.blender.org/ | https://peach.blender.org/ |
| Texte de la licence | https://creativecommons.org/licenses/by/3.0/ | https://creativecommons.org/licenses/by/3.0/ |

**Attributions à afficher** (aussi sur la page de détail de chaque film dans HomeFlix) :

> *Sintel* © copyright Blender Foundation | durian.blender.org, licence CC BY 3.0.
>
> *Big Buck Bunny* (c) copyright 2008, Blender Foundation / www.bigbuckbunny.org, licence CC BY 3.0.

**Conditions de la licence :**

1. **Attribution** : citer l'auteur comme ci-dessus.
2. **Générique conservé** : le film est diffusé en entier, avec son générique. HomeFlix ne le coupe pas.
3. **Exclusions** : les logos et les marques de la Blender Foundation ne sont pas couverts par la licence. HomeFlix n'en utilise aucun.

Les fichiers sont **remuxés sans réencodage** (`ffmpeg -c copy -movflags +faststart`) pour placer leurs métadonnées au début : les flux vidéo et audio restent ceux de la source. Cette conclusion ne vaut que pour ces deux films.

Preuves, sources exactes, sommes SHA-256 et captures datées : [`legal/DEMO_MEDIA.md`](legal/DEMO_MEDIA.md) et [`legal/P2P_DEMO.md`](legal/P2P_DEMO.md).

## Pour aller plus loin

- Risques liés aux droits d'auteur et au P2P (R9 : contenu non autorisé, R10 : repartage d'une œuvre non redistribuable) : [`RISKS.md`](RISKS.md).
- Isolation et réglages de Transmission : [`adr/0002-infrastructure.md`](adr/0002-infrastructure.md).
- Sauvegarde et restauration : [`BACKUP_RESTORE.md`](BACKUP_RESTORE.md).
