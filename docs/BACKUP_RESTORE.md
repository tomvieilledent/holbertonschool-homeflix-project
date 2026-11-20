# Sauvegarde et restauration

Ce guide explique comment sauvegarder les données de HomeFlix, comment les restaurer, et ce qui est (ou n'est pas) dans une sauvegarde. Les deux scripts se trouvent dans `homeflix/scripts/` : [`backup.sh`](../homeflix/scripts/backup.sh) et [`restore.sh`](../homeflix/scripts/restore.sh). Toutes les commandes se lancent depuis le dossier `homeflix/`, pile démarrée.

## En bref

```bash
./scripts/backup.sh                                            # crée backups/homeflix-backup-AAAAMMJJ-HHMMSS.tar.gz
./scripts/restore.sh backups/homeflix-backup-AAAAMMJJ-HHMMSS.tar.gz   # demande de taper RESTAURER avant d'écraser quoi que ce soit
```

- La sauvegarde contient **les comptes, les profils, le catalogue, la progression de lecture, les favoris et les téléchargements**.
- Elle ne contient **ni vos films, ni les fichiers téléchargés, ni le fichier `.env`**.
- Elle contient des **données personnelles** : gardez-la privée.
- La restauration **remplace** les données actuelles. Elle refuse de s'exécuter sans confirmation explicite et fait d'abord une sauvegarde de sécurité de l'état actuel.

## Ce qui est sauvegardé, ce qui ne l'est pas

| Élément | Dans la sauvegarde ? | Pourquoi, et que faire |
|---|---|---|
| Comptes, mots de passe **hachés**, rôles, profils (base `identity`) | Oui | Les mots de passe ne sont jamais stockés en clair. |
| Catalogue, titres corrigés, progression, favoris (base `library`) | Oui | |
| Catalogue d'acquisition, rappels de droits acquittés, téléchargements (base `acquisition`) | Oui | |
| Un manifeste (date, version de PostgreSQL, version du schéma, nombre de lignes par table) et les sommes SHA-256 | Oui | Elles servent à détecter une archive abîmée et à contrôler la restauration. |
| **Vos films** (le dossier `MEDIA_DIR`) | **Non** | C'est votre bibliothèque, montée en lecture seule : sa sauvegarde est de votre ressort (disque externe, NAS…). |
| **Les fichiers téléchargés** (`/downloads`) | **Non** | Ils peuvent être téléchargés de nouveau depuis le catalogue. |
| L'état de Transmission | **Non** | Rien d'important : le client se reconfigure à chaque démarrage. |
| **Le fichier `.env`** et ses secrets | **Non, volontairement** | Il contient les mots de passe des bases et les clés de signature : l'archive ne doit jamais permettre de les retrouver. Une nouvelle pile génère les siens (voir « Perte du `.env` »). |

## Faire une sauvegarde

Prérequis : la pile est démarrée (au moins la base de données : `docker compose up -d`).

```bash
./scripts/backup.sh
```

Ce que fait le script :

1. Il exporte chacune des trois bases avec `pg_dump` (format personnalisé, sans propriétaires ni droits : l'archive ne dépend pas des rôles de la pile d'origine).
2. Il refuse de continuer si un export est vide.
3. Il écrit un manifeste et les sommes SHA-256, puis crée l'archive.
4. L'archive n'apparaît sous son vrai nom **qu'une fois complète** : une panne en cours de route ne laisse pas de fichier à moitié écrit sous un nom valide.

| Détail | Valeur |
|---|---|
| Emplacement | `backups/` (dossier créé en droits **700**) ; autre dossier : `BACKUP_DIR=/mnt/disque ./scripts/backup.sh` |
| Nom | `homeflix-backup-AAAAMMJJ-HHMMSS.tar.gz` ; `--prefix <mot>` change le début du nom (lettres, chiffres, `.`, `-`, `_`) |
| Droits de l'archive | **600** : lisible par vous seul |
| Contenu | `manifest.txt`, `SHA256SUMS`, `identity.dump`, `library.dump`, `acquisition.dump` |

### Où ranger les archives, et à quelle fréquence

- **Copiez les archives hors de la machine** (disque externe, autre ordinateur) : une sauvegarde sur le même disque ne protège pas d'une panne de disque.
- Une sauvegarde **avant** toute opération risquée (mise à jour de HomeFlix, `docker compose down -v`, restauration) est la plus utile. Pour un usage domestique, une sauvegarde par semaine suffit ; la progression de lecture est la donnée qui change le plus.
- Pour automatiser (exemple non testé, à adapter) : une ligne `crontab -e` qui lance chaque nuit `cd /chemin/vers/homeflix && ./scripts/backup.sh`. Pensez à supprimer à la main les archives anciennes.
- **Données personnelles.** L'archive contient les comptes, les mots de passe hachés et l'historique de visionnage de votre foyer. Ne la committez pas dans Git, ne la partagez pas, ne la laissez pas dans un dossier ouvert aux autres utilisateurs de la machine.

## Restaurer

```bash
./scripts/restore.sh backups/homeflix-backup-AAAAMMJJ-HHMMSS.tar.gz
```

La restauration **remplace** les comptes, le catalogue, la progression et les favoris actuels par ceux de l'archive. Les films et les fichiers téléchargés ne sont ni touchés ni restaurés. Le script procède dans cet ordre, et **s'arrête sans rien modifier** au moindre problème avant l'étape 5 :

1. **Vérification de l'archive.** Elle doit être lisible, complète (les 3 exports, le manifeste et les sommes), et ses sommes SHA-256 doivent correspondre. Une archive abîmée ou modifiée est refusée : « Rien n'a été touché ».
2. **Confirmation explicite.** Il faut taper `RESTAURER` au clavier. Sans terminal (script, tâche automatique), le script refuse, sauf si vous passez `--yes`. Une réponse envoyée sur l'entrée standard n'est pas prise pour une confirmation.
3. **Base de données.** Si elle n'est pas démarrée (pile vierge, volumes supprimés), le script la démarre.
4. **Sauvegarde de sécurité** de l'état actuel (`pre-restore-AAAAMMJJ-HHMMSS.tar.gz`), s'il y a quelque chose à perdre. Si cette sauvegarde échoue, **rien n'est écrasé** (l'option `--no-safety-backup` permet de passer outre, à vos risques).
5. **Arrêt** des services applicatifs, le temps de la restauration.
6. **Restauration** de chacune des trois bases.
7. **Contrôle** : le nombre de lignes de chaque table doit être celui du manifeste. Sinon le script s'arrête et vous demande de ne pas redémarrer la pile avant d'avoir compris.
8. **Redémarrage** de la pile, qui doit redevenir saine.

Options : `--yes` (confirmer sans question), `--no-safety-backup` (ne pas faire la sauvegarde de sécurité). Aide complète : `./scripts/restore.sh --help`.

### Après une restauration

Ouvrez HomeFlix, connectez-vous (reconnectez-vous si la session a expiré) et vérifiez : vos profils, « Ma liste », « Continuer à regarder », le catalogue. Le script a déjà comparé le nombre de lignes de chaque table à celui du manifeste.

## Cas particuliers

**Restaurer sur une nouvelle machine, ou après `docker compose down -v` (pile vierge).** (Testé sur la même machine après destruction des volumes ; une autre machine n'a pas été essayée, mais le cas est le même : un `.env` neuf et une base vide.) Récupérez le code et créez le `.env` (étapes 1 et 2 de l'installation du [README](../README.md)), puis lancez `./scripts/restore.sh <archive>` : le script démarre lui-même la base vierge et la pile. Les comptes sont retrouvés avec leurs mots de passe, car seul leur hachage est dans l'archive. Le code d'installation n'est plus utilisable : l'administrateur existe déjà, il n'est pas possible d'en recréer un par ce chemin.

**Perte du fichier `.env`.** Ce n'est pas bloquant : une nouvelle pile génère ses propres secrets (`./scripts/gen-secrets.sh`) et la restauration fonctionne dessus. C'est vérifié : après une sauvegarde, la destruction des volumes **et** du `.env` puis un nouveau `.env` (jeton d'installation et mots de passe de base différents), la restauration a retrouvé le compte, qui se connecte avec son ancien mot de passe, et le code d'installation du nouveau `.env` est refusé (409 : un administrateur existe déjà). Ne régénérez pas un `.env` pour une pile qui contient déjà des données sans lire l'avertissement de `.env.example` (les mots de passe des bases ne sont lus qu'à la création du volume).

**Restaurer une archive créée par une version plus récente de HomeFlix.** Le schéma de l'archive serait plus récent que le code : au redémarrage, Flyway refuse de démarrer et le script l'indique. Mettez le code à la version de l'archive, puis recommencez.

**Archive abîmée.** Le script la refuse à l'étape 1 avec le message sur les sommes SHA-256, sans rien modifier. Utilisez une autre archive (la sauvegarde `pre-restore-…` ou une copie plus ancienne).

**Remise à zéro volontaire.** `docker compose down -v` efface les données **sans** sauvegarde. Faites un `./scripts/backup.sh` avant si vous pourriez en avoir besoin.

## Comment on sait que ça marche

Le script [`test-backup-restore.sh`](../homeflix/scripts/test-backup-restore.sh) rejoue tout le scénario dans un projet Docker **isolé** (`homeflix-backuptest`, port 8097) : il ne touche jamais aux volumes de votre vraie pile. Il crée des données (administrateur par l'API, profil, progression, favori, catalogue, téléchargement terminé), fait la sauvegarde, détruit tous les volumes, restaure sur une pile vierge et compare les données avant et après. Il vérifie aussi que :

- l'archive est en droits 600 dans un dossier 700, et ne contient ni média, ni `.env`, ni aucun secret ;
- la restauration sans confirmation, et celle d'une archive abîmée, sont **refusées** sans rien modifier ;
- une seconde restauration, sur un état non vide, crée d'abord la sauvegarde de sécurité.

```bash
./scripts/test-backup-restore.sh      # quelques minutes (la pile démarre deux fois)
```

Voir aussi : le script `test-persistence.sh` (issue #89), qui vérifie que les données survivent à un simple redémarrage des conteneurs, sans sauvegarde.
