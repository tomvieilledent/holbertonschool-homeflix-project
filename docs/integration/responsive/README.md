# Revue du responsive design (#96)

Revue faite le 25/11/2026 sur la pile Docker Compose, avec des données de test aux titres volontairement longs.

## Résultat

- **Aucun défilement horizontal de page** sur les écrans, menus et fenêtres de dialogue mesurés à 320, 360, 559, 560, 568, 768 et 1280 px. Seules les rangées de films de l'accueil défilent, par choix.
- **Parcours principal au toucher** (connexion, profil, catalogue, recherche, fiche, « Ma liste », lecture, pause, paysage, reprise, déconnexion) : réussi sur téléphones émulés, avec Chromium (360×740, 360×640 et un iPhone 13 émulé, 390×664) et WebKit, le moteur de Safari (iPhone SE et iPhone 13).
- **Cibles tactiles** : à 360 px, les boutons, champs et liens isolés mesurés font au moins 44 px de haut (les liens placés dans une phrase ne sont pas comptés).

## Comportement selon la largeur

| Élément | Étroit | Large |
|---|---|---|
| Navigation | Moins de 560 px : barre fixe en bas de l'écran | Dans l'en-tête |
| Grille du catalogue et de « Ma liste » | Jusqu'à 640 px : deux colonnes | Autant de colonnes que la place le permet |
| Tableaux d'administration | Conteneur de 704 px au plus : une fiche par ligne (`components/DataTable`) | Tableau |
| Titres | Jusqu'à 640 px : taille réduite | Taille de la charte |
| Lecteur | Moins de 560 px : barre de position sur sa propre ligne ; écran bas (paysage) : image limitée à la hauteur de l’écran | Image en 16:9 |

## Captures

| Écran | 360 px | 768 px | 1280 px |
|---|---|---|---|
| Accueil | [voir](360-accueil.png) | [voir](768-accueil.png) | [voir](1280-accueil.png) |
| Catalogue | [voir](360-catalogue.png) | [voir](768-catalogue.png) | [voir](1280-catalogue.png) |
| Fiche | [voir](360-fiche.png) | [voir](768-fiche.png) | [voir](1280-fiche.png) |
| Lecteur | [voir](360-lecteur.png) | [voir](768-lecteur.png) | [voir](1280-lecteur.png) |
| Administration, comptes | [voir](360-admin-comptes.png) | [voir](768-admin-comptes.png) | [voir](1280-admin-comptes.png) |
| Administration, acquisition | [voir](360-admin-acquisition.png) | [voir](768-admin-acquisition.png) | [voir](1280-admin-acquisition.png) |

## Non vérifié

- **Aucun essai sur un vrai téléphone** : les téléphones sont émulés. Hors `localhost`, il faut HTTPS ou `COOKIE_SECURE=false` pour que la session tienne (README, section 8).
- Sur iPhone, le lecteur n'affiche pas de bouton « Plein écran » : le navigateur ne permet pas le plein écran d'un élément de la page.
