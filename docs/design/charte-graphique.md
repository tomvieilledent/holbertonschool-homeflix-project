# Homeflix — Charte graphique

## Logo

Le logo associe un « H » formé de deux barres verticales et un bouton lecture. Le mot FLIX est découpé dans la barre droite du H : les lettres prennent la couleur du fond.

- Couleur : `#F68657` sur fond `#1F2124`, sans contour.
- Marge libre : au moins la largeur d'une barre du H.
- Taille minimale avec lettres : 48 px de haut. En dessous, utiliser le favicon (sans lettres).
- À éviter : déformer, recolorer hors palette, ajouter un contour.

| Version | Fichier (`homeflix/frontend/src/assets/logo/`) | Usage |
| --- | --- | --- |
| Couleur | `logo.svg` | Thème sombre |
| Monochrome foncé | `logo-mono-dark.svg` | Thème clair, impressions |
| Monochrome blanc | `logo-mono-white.svg` | Photos, vidéos, fonds foncés autres que `#1F2124` |
| Favicon | `public/favicon.svg` | Onglet du navigateur, sans lettres |

## Palette

| Rôle | Token | Hex |
| --- | --- | --- |
| Principale | `--color-primary` | `#F68657` |
| Secondaire | `--color-secondary` | `#F6B352` |
| Surface | `--color-surface` | `#383A3F` |
| Fond | `--color-bg` | `#1F2124` |

Les tokens sémantiques des deux thèmes (texte, liens, bordures, états) sont dans `homeflix/frontend/src/styles/tokens.css`. Leurs contrastes sont vérifiés par `npm run check:contrast`.

## Typographie

Trois polices, chargées en local (variables, graisses 300 à 700) : aucun appel à un CDN de polices.

| Police | Token | Usage |
| --- | --- | --- |
| Plus Jakarta Sans | `--font-heading` | Titres de page et titres de fiches (films, séries) |
| Roboto | `--font-ui` | Éléments d'interface : boutons, champs, libellés de formulaire, onglets, badges |
| Public Sans | `--font-text` (et `--font-nav`) | Textes longs (synopsis, descriptions) et navigation |

Graisses : Light 300 (grands chiffres), Regular 400 (texte), Medium 500 (boutons, libellés), Bold 700 (titres).

| Niveau | Police | Taille / interligne | Graisse |
| --- | --- | --- | --- |
| Titre 1 | Plus Jakarta Sans | 48 / 56 px | Bold |
| Titre 2 | Plus Jakarta Sans | 32 / 40 px | Bold |
| Titre 3 | Plus Jakarta Sans | 24 / 32 px | Medium |
| Texte, synopsis | Public Sans | 16 / 24 px | Regular |
| Petit texte | Public Sans | 14 / 20 px | Regular |
| Navigation | Public Sans | 16 / 24 px | Medium |
| Boutons, libellés | Roboto | 16 / 24 px | Medium |
| Légende | Roboto | 12 / 16 px | Medium, majuscules, 0,04 em |

Les trois polices sont libres (licence SIL OFL) : pas de licence web à acheter. Pile de repli : `system-ui, sans-serif`.
