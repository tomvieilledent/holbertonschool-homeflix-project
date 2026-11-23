import { createContext, useContext } from 'react'

export const FavouritesContext = createContext(null)

/**
 * « Ma liste » du profil actif, partagée par toutes les vues. À utiliser sous `<FavouritesProvider>`.
 * @returns {{
 *   status: 'loading'|'ready'|'error',
 *   items: object[],
 *   isFavourite: (mediaId: string) => boolean,
 *   isPending: (mediaId: string) => boolean,
 *   toggle: (media: object) => Promise<boolean>,
 *   reload: () => void,
 * }} `items` : les plus récents en premier. `toggle` met à jour tout de suite (mise à jour optimiste), appelle le
 *   serveur, puis revient en arrière avec un message si l'appel échoue ; il résout `true` en cas de succès.
 */
export function useFavourites() {
  const context = useContext(FavouritesContext)
  if (!context) throw new Error('useFavourites doit être utilisé dans un <FavouritesProvider>')
  return context
}
