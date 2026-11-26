import { useCallback, useEffect, useState } from 'react'
import Button from '@/components/Button'
import ErrorState from '@/components/ErrorState'
import { useToast } from '@/components/toastContext'
import MediaRow from '@/features/catalogue/MediaRow'
import FavouriteCard from '@/features/favourites/FavouriteCard'
import { isAbortError } from '@/services/api'
import { listAllCompleted, resetProgress } from '@/services/library'

/**
 * « Titres terminés » du profil actif (`GET /me/completed`), le dernier vu en premier. Réinitialiser la progression
 * d'un film le remet à « pas commencé » : il quitte la rangée une fois que le serveur a accepté. La rangée est masquée
 * tant qu'elle est vide ; un échec de chargement ne touche pas le reste de l'accueil.
 */
export default function CompletedRow() {
  const toast = useToast()
  const [items, setItems] = useState([])
  const [failure, setFailure] = useState(null)
  const [resetting, setResetting] = useState(() => new Set())

  const load = useCallback((signal) => {
    setFailure(null)
    listAllCompleted(signal)
      .then(setItems)
      .catch((error) => {
        if (!isAbortError(error)) setFailure(error)
      })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const markResetting = (mediaId, on) =>
    setResetting((current) => {
      const next = new Set(current)
      if (on) next.add(mediaId)
      else next.delete(mediaId)
      return next
    })

  const reset = async ({ id, title }) => {
    markResetting(id, true)
    try {
      await resetProgress(id)
      setItems((list) => list.filter((media) => media.id !== id))
      toast.show(`Progression de « ${title} » réinitialisée.`, { variant: 'success' })
    } catch (error) {
      toast.show(`Impossible de réinitialiser la progression de « ${title} ». ${error.message}`, { variant: 'error' })
    } finally {
      markResetting(id, false)
    }
  }

  if (failure) {
    return <ErrorState title="Titres terminés indisponibles" description={failure.message} onRetry={() => load()} />
  }
  if (items.length === 0) return null

  return (
    <MediaRow title="Titres terminés">
      {items.map((media) => (
        <FavouriteCard
          key={media.id}
          media={media}
          action={
            <Button variant="secondary" busy={resetting.has(media.id)} onClick={() => reset(media)}>
              Réinitialiser la progression{' '}
              <span className="visually-hidden">de « {media.title} »</span>
            </Button>
          }
        />
      ))}
    </MediaRow>
  )
}
