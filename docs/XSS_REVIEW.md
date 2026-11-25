# Revue XSS et rendu sécurisé du contenu utilisateur (#86)

Revue du frontend faite le 25/11/2026, sur le code et sur la pile Docker Compose (Chromium).

## Résultat

**Aucun HTML injecté n'est interprété.** Titres, descriptions, genres, noms de profils, libellés de dossiers, adresses e-mail, catalogue d'acquisition, recherche et adresses de page sont rendus comme du texte.

## Ce qui a été vérifié

| Point | Résultat |
|---|---|
| Recherche de `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function` | Aucun usage. Un test (`src/security/sinks.test.js`) échoue si l'un apparaît |
| Rendu de charges `<script>` et `<img onerror>` par tous les écrans qui affichent du texte | Texte affiché tel quel (`src/security/xss.test.jsx`, API simulée) |
| Mêmes charges enregistrées par les **vraies API** puis affichées dans le navigateur | 19 contrôles réussis : aucun élément créé, aucun script exécuté, aucune boîte de dialogue |
| Liens construits à partir de données | Seule la preuve de licence vient du serveur : acceptée seulement en `http(s)` (test existant) |
| En-tête `Content-Security-Policy` (nginx) | `script-src 'self'` : un gestionnaire en ligne ajouté à la main dans la page est bloqué par le navigateur |
| Destination après connexion (`?next=`) | Aucune redirection vers un autre site. Un défaut corrigé, voir ci-dessous |

## Défaut trouvé et corrigé

`?next=/%09/autre-site` (tabulation, ou retour à la ligne) passait la vérification `safeNext`, qui ne refusait que `//autre-site`. Le navigateur retirant ces caractères, la destination devenait externe. Le routeur bloquait la sortie en levant une erreur : pas de redirection, mais l'utilisateur restait coincé (« Chargement… » sans fin à la connexion, boutons de profil sans effet). `safeNext` refuse désormais les caractères de contrôle.

## À savoir

- **Le serveur enregistre le texte tel quel** : titres, noms de profils, libellés et même une adresse e-mail contenant des balises sont acceptés (l'identifiant de compte, lui, est limité à `A-Za-z0-9._-`). La protection repose sur le rendu : tout nouvel affichage (autre client, e-mail, export) devra aussi échapper ce texte.
- Non couverts : les noms de fichiers contenant des balises (testés seulement par la correction du titre) et les navigateurs autres que Chromium pour le parcours réel.
