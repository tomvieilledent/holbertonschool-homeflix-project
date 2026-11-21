# Point d'intégration J7 : profils, progression, favoris, administration

Compte rendu du parcours à deux profils sur la pile Compose, réalisé le 2026-11-21 sur `main` (commit `aef282d`). Il couvre les profils, la progression, les favoris et l'administration des comptes et du catalogue.

> **Le volet acquisition n'est pas couvert.** Il dépend de l'issue #88 (rappel des droits, démarrage, statut et annulation des téléchargements), qui n'est pas encore fusionnée. Il sera déroulé et ajouté à ce compte rendu quand #88 sera livrée. L'issue #82 reste donc ouverte.

## Méthode

- Pile complète démarrée avec `docker compose` dans un projet isolé, avec les deux films de démonstration (*Big Buck Bunny* et *Sintel*, voir [`legal/DEMO_MEDIA.md`](legal/DEMO_MEDIA.md)).
- **Parcours par l'API**, par le reverse proxy comme le fait le navigateur : 83 contrôles, un code de réponse attendu à chaque étape.
- **Parcours dans un vrai navigateur** (Chromium piloté par Puppeteer, qui décode bien le H.264) : 25 contrôles, avec captures d'écran.
- Compte « famille » (utilisateur) avec deux profils, Alice et Bob ; compte « autre » (utilisateur) pour l'isolation ; compte administrateur.
- Le parcours a été rejoué sur deux états de `main` à un jour d'écart, avec les mêmes résultats.

## Résultat en bref

Le cœur fonctionne : **deux profils d'un même compte ont des favoris et une progression strictement séparés**, de bout en bout, dans l'API comme dans l'interface. Les autres comptes n'y ont pas accès, la lecture fonctionne, les rôles sont respectés.

| Parcours | Résultat |
|---|---|
| Installation, premier administrateur, dossiers, indexation, catalogue | Conforme |
| Deux profils : création, sélection, séparation des favoris et de la progression | Conforme |
| Isolation entre comptes (sélection, modification, suppression d'un profil d'autrui) | Conforme (404) |
| Lecture (ticket de streaming, plages d'octets, vidéo lue dans le navigateur) | Conforme |
| Rôles : un utilisateur n'accède ni aux comptes, ni aux dossiers, ni à l'administration | Conforme (403) |
| Administration des comptes : création, doublon, désactivation, dernier administrateur | Conforme, sauf la suppression (E3) |
| Session : rafraîchissement, déconnexion, protection contre les requêtes intersites | Conforme, sauf la perte du profil actif (E1) |
| Accueil, progression enregistrée par le lecteur, gestion des profils, écrans d'administration | **Pas encore là** (E5 à E8) |

## Ce qui est prouvé

Captures dans [`integration/j7/`](integration/j7/).

- **Séparation des profils** (API) : Alice ajoute *Big Buck Bunny* à sa liste et enregistre 754 s sur 3600. Bob a 0 favori et un état `NOT_STARTED` sur le même film ; il ajoute *Sintel* et enregistre 100 s sur 5000. Alice garde 1 favori (*Big Buck Bunny*), sa position de 754 s et un état `NOT_STARTED` sur *Sintel*.
- **Séparation des profils** (interface) : sur la fiche du film, Alice voit « Dans ma liste » et « Revoir » ; Bob voit « Ajouter à ma liste » et « Lecture » ([capture](integration/j7/04-detail-alice.png), [capture](integration/j7/07-detail-bob.png)). Après un changement de profil par le menu, chacun retrouve sa liste intacte.
- **Isolation entre comptes** : le compte « autre » reçoit 404 en voulant sélectionner, modifier ou supprimer le profil d'Alice, et ne voit aucun profil de « famille ».
- **Lecture** : ticket de streaming, lecture par plages d'octets (206), un ticket ne lit pas un autre film (403), pas de ticket sans profil actif (409). Dans le navigateur, la vidéo (596 s) se charge et avance (de 0 à 11,9 s en 12 s) ([capture](integration/j7/05-lecteur-alice.png)).
- **Rôles** : 403 pour un utilisateur sur les routes d'administration (Identity et Library) ; dans l'interface, il voit « Accès refusé » ([capture](integration/j7/09-admin-refuse-utilisateur.png)).
- **Administration des comptes** : doublon d'identifiant refusé (409) ; compte désactivé : connexion refusée (403 `ACCOUNT_DISABLED`), réactivation et reconnexion possibles ; le dernier administrateur ne peut être ni désactivé ni rétrogradé (409).
- **Session** : `/auth/refresh` exige l'en-tête `X-Requested-With` (403 sans) ; après déconnexion, le rafraîchissement est refusé (401) ; le jeton d'accès dure 900 s.
- **Suppression d'un profil** : le profil disparaît, n'est plus sélectionnable (404) ; un profil recréé au même nom repart sans favori ni progression.

## Écarts

Chaque écart est rattaché à une issue existante ou à une issue à ouvrir. « Bloquant » signifie qu'il empêche de dérouler le parcours de démonstration.

| # | Constat | Preuve | Issue | Bloquant pour la démo |
|---|---|---|---|---|
| E1 | **Le profil actif est perdu quand la page est rechargée.** Le contrat dit que `/auth/refresh` conserve le claim `pid`, mais le jeton rafraîchi n'en a plus : après sélection d'Alice puis rafraîchissement avec le même cookie, `pid` est absent et les favoris répondent 409. Dans le navigateur, F5 (ou l'ouverture d'un lien) renvoie à « Qui regarde ? » avec la destination conservée. | [capture](integration/j7/06-apres-rechargement.png) | **À ouvrir** (`type:bug`, Identity) | Non, mais gênant : un clic de plus à chaque rechargement |
| E2 | **Le mot de passe temporaire ne peut jamais être changé.** Après `password-reset`, le compte porte `mustChangePassword: true`, mais aucune route de changement de mot de passe n'existe (404) et le drapeau n'est appliqué nulle part (le catalogue reste accessible). Le mot de passe choisi par l'administrateur reste valable indéfiniment. | Réinitialisation du mot de passe de « autre », connexion avec le mot de passe temporaire : `/auth/me` renvoie `mustChangePassword: true` ; `POST /auth/change-password` : 404 ; `GET /media` avec ce jeton : 200 | **À ouvrir** (`type:bug`, Identity et frontend) | Non |
| E3 | **`DELETE /admin/accounts/{id}` répond 405**, alors que le contrat le prévoit (suppression d'un compte et de ses données, 409 pour le dernier administrateur). | `DELETE` sur un compte ordinaire puis sur le dernier administrateur : 405 dans les deux cas (attendu 204 et 409) | #97 (déjà ouverte), #102 pour l'écran | Non |
| E4 | **Un compte désactivé garde l'accès à l'API jusqu'à 15 minutes** avec un jeton déjà émis, alors que le contrat parle de révocation immédiate des sessions. Seul le refresh token est révoqué : les jetons d'accès sont signés et vérifiés sans appel à Identity. | Désactivation de « famille » (200), puis `GET /media` avec le jeton émis avant : 200 | Pas d'issue de code : **préciser le contrat** (« sessions » = refresh tokens) et inscrire dans `RISKS.md` | Non |
| E5 | **L'accueil est en erreur** : `GET /home` et `GET /me/continue-watching` répondent 404 (prévus au contrat, non implémentés). L'écran d'accueil, page d'arrivée après la connexion, affiche « Une erreur est survenue ». | [capture](integration/j7/02-accueil-alice.png) | #87 (ouverte) | **Oui** |
| E6 | **Le lecteur n'enregistre jamais la position.** Bob lit 12 secondes ; seul `GET /progress` est émis, jamais `PUT` ; l'API répond encore `NOT_STARTED`. « Reprendre à… » et « Continuer à regarder » ne peuvent donc pas apparaître par l'interface. | Parcours navigateur (lecture de Bob) | #65 (ouverte) | **Oui** |
| E7 | **L'interface ne permet pas de créer, renommer ni supprimer un profil** : « Qui regarde ? » ne propose que les profils existants. Un nouvel utilisateur ne peut pas commencer sans appeler l'API. | [capture](integration/j7/08-profils.png) | #76 (ouverte) | **Oui** |
| E8 | **Les écrans d'administration sont des maquettes vides** (« Administration », « Administration — Acquisition »). Dossiers, comptes, indexation, métadonnées et téléchargements ne se pilotent que par l'API. | [capture](integration/j7/11-admin-admin.png) | #69, #77, #83, #84, #85, #94, #95 (ouvertes) | **Oui** |
| E9 | **Les titres du catalogue sont les noms de fichier** (`big-buck-bunny-2008-640`) tant que l'administrateur n'a pas corrigé les métadonnées, qui ne se corrigent que par l'API. Le script de remise à zéro de la démonstration (#93) les corrige. | [capture](integration/j7/07-detail-bob.png) | #84 (ouverte) | Non |

## Ce qui n'est pas couvert

- L'acquisition : rappel des droits, démarrage, suivi et annulation d'un téléchargement (#88), et le chemin « téléchargement terminé, puis indexé ».
- Le téléchargement P2P réel (voir [`legal/P2P_DEMO.md`](legal/P2P_DEMO.md)).
- L'affichage sur téléphone, l'accessibilité au clavier, les performances de lecture sur un gros fichier.
- Une machine autre que celle du développement.
