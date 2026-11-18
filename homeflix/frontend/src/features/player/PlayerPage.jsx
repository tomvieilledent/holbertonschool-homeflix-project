import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ErrorState from '@/components/ErrorState'
import Spinner from '@/components/Spinner'
import VideoPlayer from '@/features/player/VideoPlayer'
import { isAbortError } from '@/services/api'
import { userMessage } from '@/services/errorMessages'
import { getStreamTicket } from '@/services/streaming'

const MEDIA_ERR_SRC_NOT_SUPPORTED = 4

/** Message d'un échec de lecture du navigateur (le format non pris en charge est le cas utile à dire). */
const playbackMessage = (mediaError) =>
  mediaError?.code === MEDIA_ERR_SRC_NOT_SUPPORTED
    ? userMessage('MEDIA_UNSUPPORTED_FORMAT')
    : 'La lecture a échoué. Réessayez dans un instant.'

/**
 * Lecture d'un film : demande un ticket de streaming (`POST /media/{id}/stream-ticket`) puis charge le
 * flux dans le lecteur. Si le flux est refusé en cours de route (ticket expiré), un nouveau ticket est
 * demandé une fois et la lecture reprend à la même position.
 */
export default function PlayerPage() {
  const { mediaId } = useParams()
  const [ticket, setTicket] = useState(null) // null = chargement
  const [error, setError] = useState('')
  const resumeAt = useRef(0)
  const refreshes = useRef(0)

  const load = useCallback(
    (signal) => {
      setError('')
      setTicket(null)
      getStreamTicket(mediaId, signal)
        .then(setTicket)
        .catch((failure) => {
          if (!isAbortError(failure)) setError(failure.message)
        })
    },
    [mediaId],
  )

  useEffect(() => {
    resumeAt.current = 0
    refreshes.current = 0
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const onPlaybackError = (mediaError, currentTime) => {
    if (refreshes.current < 1) {
      refreshes.current += 1
      resumeAt.current = currentTime
      load()
      return
    }
    setTicket(null)
    setError(playbackMessage(mediaError))
  }

  const back = <Link to={`/media/${encodeURIComponent(mediaId)}`}>Retour à la fiche</Link>

  let content
  if (error) {
    content = (
      <ErrorState title="Lecture impossible" description={error} onRetry={() => load()}>
        {back}
      </ErrorState>
    )
  } else if (ticket === null) {
    content = <Spinner size="lg" label="Préparation de la lecture…" />
  } else {
    content = (
      <VideoPlayer
        src={ticket.url}
        startAt={resumeAt.current}
        onError={onPlaybackError}
        onReady={() => {
          refreshes.current = 0
        }}
      />
    )
  }

  return (
    <section className="player-page">
      <h1 className="visually-hidden">Lecture</h1>
      {!error && <p>{back}</p>}
      {content}
    </section>
  )
}
