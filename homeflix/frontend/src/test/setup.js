import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'

// Les pages d'administration sont chargées à la demande : sur un exécuteur lent (CI), le premier rendu dépasse
// la seconde par défaut des requêtes asynchrones. Le délai ne coûte rien quand tout va bien (on rend la main dès que
// l'élément apparaît) ; il ne s'allonge que pour un test déjà en échec.
configure({ asyncUtilTimeout: 5000 })
