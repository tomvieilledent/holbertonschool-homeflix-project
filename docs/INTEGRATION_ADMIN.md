# Intégration de l'administration et de l'acquisition sur les vrais services (#104)

Fait le 25/11/2026 sur la pile Docker Compose, sans mock, avec un compte administrateur.

**Version testée :** `main` avec les pull requests #262, #263, #264, #266 et #268, plus le travail de #103 (#271). Le parcours a été joué sur une copie locale de cet ensemble avant la fusion ; son code est identique à celui de `main` après fusion avec #271. Les tests de bout en bout et du frontend ont été rejoués sur `main` après les fusions, sans #271.

## Résultat

**Les écrans d'administration fonctionnent contre l'API réelle.** Un défaut du service Library reste à corriger (A1).

| Contrôle | Résultat |
|---|---|
| Parcours administrateur par l'interface (comptes, dossiers, indexation, médias, acquisition, services, droits) | 38 contrôles réussis sur 39 ; l'échec est le défaut A1 |
| Conformité aux contrats OpenAPI : statut, corps de réponse, corps des requêtes acceptées, champs non documentés | **Aucun écart.** Les 101 couples opération et statut documentés pour l'administration et l'acquisition ont été observés |
| Tests de bout en bout (`homeflix/e2e`), avec 4 nouveaux tests d'administration | 10 sur 10 (sur la copie locale, puis sur `main` après les fusions) |

## Écarts à corriger côté serveur

| # | Constat | Service | Suggestion |
|---|---|---|---|
| A1 | **Retirer un dossier puis le rajouter indexe ses films en double.** Constaté : 31 films avant, 36 après (5 fichiers dans le dossier). La fiche corrigée (titre, genre, année), sa place dans « Ma liste » et sa progression restent sur l'ancienne entrée, indisponible ; la nouvelle repart de zéro | Library | À l'ajout, réactiver le dossier retiré de même chemin (`removed = false`) : les entrées seraient retrouvées par dossier et chemin relatif |
| A2 | Deux fichiers identiques donnent deux entrées, « Doublons 0 » | Library | Point encore ouvert dans #73 |
| A3 | Un fichier `.mp4` corrompu est ajouté au catalogue, « Erreurs 0 » ; l'échec n'apparaît qu'à la lecture | Library | Contrôler le contenu à l'indexation, ou assumer et le documenter |
| A4 | La durée reste vide (« — ») pour les films indexés | Library | Limite déjà connue ([`KNOWN_LIMITS.md`](KNOWN_LIMITS.md)) |
| A5 | Un téléchargement reste « En cours » : ni « Terminé » ni ajout à la bibliothèque | Acquisition | #99 |

## Corrigé côté interface

La fenêtre de retrait d'un dossier disait « vous pourrez le rajouter plus tard » sans prévenir de A1. Elle indique maintenant que les films seront ajoutés comme de nouveaux films. **Texte à revoir quand A1 sera corrigé.**

## À savoir

- L'interface ne permet ni de renommer ni de désactiver un dossier, alors que le contrat le prévoit (`PATCH /admin/media-roots/{rootId}`).
- Une entrée retirée du catalogue ne revient pas à l'indexation suivante : c'est annoncé avant la confirmation, et rien ne permet de la rétablir.
- Les écrans d'administration fonctionnent sans profil actif.

## Non vérifié

- Aucun transfert BitTorrent réel : Transmission était coupé d'Internet. L'état « Terminé » d'un téléchargement a été écrit dans la base de test pour obtenir le refus d'annulation (409).
- Un dossier non lisible (`ROOT_NOT_READABLE`) : les permissions ne peuvent pas être retirées sur le montage Windows utilisé. Ce code partage son statut (400) avec les autres refus, observés.
- Le changement de rôle d'un administrateur pendant qu'il est connecté.
- Navigateur : Chromium uniquement.
