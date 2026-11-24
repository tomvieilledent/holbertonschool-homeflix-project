import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '@/components/toastContext'
import { FavouritesContext } from '@/features/favourites/favouritesContext'
import { isAbortError } from '@/services/api'
import { addFavourite, listAllFavourites, removeFavourite } from '@/services/library'

/** Remet `item` à sa place (`index`) dans la liste, sans doublon. */
function insertAt(list, item, index) {
  const next = list.filter((other) => other.id !== item.id)
  next.splice(Math.min(index, next.length), 0, item)
  return next
}

/**
 * Charge « Ma liste » du profil actif une fois et la partage (`useFavourites()`). Ajouter ou retirer un film
 * met à jour toutes les vues immédiatement ; si le serveur refuse, l'état précédent est restauré et un message
 * d'erreur s'affiche. Un film dont l'appel est en cours ne peut pas être basculé de nouveau.
 * À remonter quand le profil change : les favoris sont propres à chaque profil.
 * @param {object} props
 * @param {React.ReactNode} props.children
 */
export default function FavouritesProvider({ children }) {
  const toast = useToast()
  const [status, setStatus] = useState('loading')
  const [items, setItems] = useState([])
  const [pending, setPending] = useState(() => new Set())
  const itemsRef = useRef(items)
  const pendingRef = useRef(pending)

  useEffect(() => {
    itemsRef.current = items
  })

  const load = useCallback((signal) => {
    setStatus('loading')
    listAllFavourites(signal)
      .then((list) => {
        setItems(list)
        setStatus('ready')
      })
      .catch((error) => {
        if (!isAbortError(error)) setStatus('error')
      })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const markPending = useCallback((mediaId, on) => {
    const next = new Set(pendingRef.current)
    if (on) next.add(mediaId)
    else next.delete(mediaId)
    pendingRef.current = next // à jour tout de suite : bloque un double clic avant le prochain rendu
    setPending(next)
  }, [])

  const toggle = useCallback(
    async (media) => {
      const { id } = media
      if (pendingRef.current.has(id)) return false
      const index = itemsRef.current.findIndex((item) => item.id === id)
      const previous = itemsRef.current[index]
      const wasFavourite = index >= 0

      // Mise à jour optimiste : l'interface change avant la réponse du serveur.
      setItems((list) =>
        wasFavourite ? list.filter((item) => item.id !== id) : [media, ...list.filter((item) => item.id !== id)],
      )
      markPending(id, true)
      try {
        await (wasFavourite ? removeFavourite(id) : addFavourite(id))
        return true
      } catch (failure) {
        // Retour arrière : l'élément retrouve sa place d'origine.
        setItems((list) => (wasFavourite ? insertAt(list, previous, index) : list.filter((item) => item.id !== id)))
        toast.show(
          `${wasFavourite ? 'Impossible de retirer' : 'Impossible d’ajouter'} « ${media.title} » ${
            wasFavourite ? 'de' : 'à'
          } votre liste. ${failure.message}`,
          { variant: 'error' },
        )
        return false
      } finally {
        markPending(id, false)
      }
    },
    [markPending, toast],
  )

  const value = useMemo(() => {
    const ids = new Set(items.map((item) => item.id))
    return {
      status,
      items,
      isFavourite: (mediaId) => ids.has(mediaId),
      isPending: (mediaId) => pending.has(mediaId),
      toggle,
      reload: () => load(),
    }
  }, [status, items, pending, toggle, load])

  return <FavouritesContext.Provider value={value}>{children}</FavouritesContext.Provider>
}
