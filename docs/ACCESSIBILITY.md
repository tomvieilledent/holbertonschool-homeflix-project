# Accessibilité : clavier, focus, ARIA et contrastes (#103)

Audit fait le 25/11/2026 sur la pile Docker Compose, avec Chromium.

## Résultat

| Critère | Résultat |
|---|---|
| Aucune violation axe critique sur les pages principales | **Atteint** : aucune violation, quelle que soit la gravité, sur 62 écrans et dialogues (31 à 1280 px, 31 à 360 px) |
| Le parcours complet est faisable au clavier | **Atteint** dans le parcours automatisé : 24 étapes sur 24 à 1280 px et à 360 px, un indicateur de focus visible à chaque arrêt de tabulation |

## Méthode

- **axe-core**, règles WCAG 2.0, 2.1 et 2.2 de niveaux A et AA, plus les bonnes pratiques, dans un vrai navigateur (contrastes compris) : connexion, première configuration, profils, accueil, catalogue, recherche vide, « Ma liste », fiche, lecteur, compte, page introuvable, les cinq pages d'administration, les dialogues, les états d'erreur.
- **Parcours au clavier seul**, joué par un script (aucun clic) : connexion, profil, lien d'évitement, catalogue, recherche, fiche, « Ma liste », lecture (raccourcis et curseurs), menu du compte, profils, création et suppression d'un compte, pages d'administration, déconnexion, intro animée. À chaque étape : où est le focus, est-il visible, quel est le titre de l'onglet.
- **Contrastes** : `npm run check:contrast` (thèmes sombre et clair) en plus d'axe sur le thème sombre.

## Problèmes trouvés et corrigés

| Problème | Critère WCAG | Correction |
|---|---|---|
| L'onglet s'appelait « Homeflix » sur toutes les pages | 2.4.2 Titre de page | Un titre par page (`handle.title`), le nom du film sur sa fiche |
| Le focus se perdait après la plupart des changements de page | 2.4.3 Parcours du focus | S'il disparaît avec l'ancienne page, le contenu principal le reçoit |
| Le focus se perdait quand l'élément activé était retiré (« Ma liste », suppression d'une ligne) | 2.4.3 | Il passe à l'élément qui prend sa place |
| Un bouton désactivé pendant une action faisait perdre le focus (connexion, « Ma liste », choix du profil, indexation, actualisation des services) | 2.4.3 | Bouton indisponible mais focalisable (`aria-disabled`), champs en lecture seule |
| Le menu du compte restait ouvert quand le clavier le quittait | 2.4.3 | Il se ferme |
| Le lien d'évitement était positionné dans la page, pas dans la fenêtre | 2.4.1 Contourner des blocs | Position fixe |
| Nom accessible différent du texte visible (« Voir la preuve », « Voir dans la bibliothèque ») | 2.5.3 Étiquette dans le nom | Le nom commence par le texte visible |
| Niveaux de titre sautés (catalogue, « Ma liste ») et fiche introuvable sans titre principal | 1.3.1 Information et relations | Titre de section, titre principal |
| Le nombre de résultats d'une recherche n'était pas annoncé de façon fiable | 4.1.3 Messages d'état | Zone d'annonce toujours présente |

## Contrôles automatiques

- `src/accessibility/axe.test.jsx` : axe sur les pages et dialogues principaux, à chaque pull request (sans les contrastes, que l'environnement de test ne calcule pas).
- `src/accessibility/keyboard.test.jsx` : titres d'onglet et suivi du focus.

## Non vérifié

- **Aucun lecteur d'écran** (NVDA, VoiceOver, TalkBack) : les annonces et les noms sont contrôlés par axe et par les tests, pas à l'écoute.
- **Passage clavier par une personne** : le parcours est automatisé. Un passage à la main reste recommandé.
- Navigateurs autres que Chromium, zoom à 200 % et 400 %, mode de contraste élevé du système.
- Lighthouse n'a pas été lancé à part : ses contrôles d'accessibilité reposent sur axe.
- La vidéo n'a ni sous-titres ni transcription (choix du MVP, voir [`KNOWN_LIMITS.md`](KNOWN_LIMITS.md)).
