import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import Button from '@/components/Button'
import ErrorState from '@/components/ErrorState'
import Spinner from '@/components/Spinner'
import { playAction } from '@/features/catalogue/format'
import useProgressSaver from '@/features/player/useProgressSaver'
import VideoPlayer from '@/features/player/VideoPlayer'
import { isAbortError } from '@/services/api'
import { userMessage } from '@/services/errorMessages'
import { getProgress, resetProgress } from '@/services/library'
import { getStreamTicket } from '@/services/streaming'

const MEDIA_ERR_SRC_NOT_SUPPORTED = 4

/** Position de départ de l'URL (`?t=312`, en secondes) ; toute valeur invalide ou négative donne 0. */
export const startFromParams = (params) => {
  const seconds = Number(params.get('t'))
  return Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
}

/** Message d'un échec de lecture du navigateur (le format non pris en charge est le cas utile à dire). */
const playbackMessage = (mediaError) =>
  mediaError?.code === MEDIA_ERR_SRC_NOT_SUPPORTED
    ? userMessage('MEDIA_UNSUPPORTED_FORMAT')
    : 'La lecture a échoué. Réessayez dans un instant.'

/**
 * Lecture d'un film : demande un ticket de streaming (`POST /media/{id}/stream-ticket`) puis charge le
 * flux dans le lecteur, à la position `?t=` si elle est donnée, sinon à la dernière position du profil
 * (un film terminé repart du début). La position est sauvegardée pendant la lecture (voir `useProgressSaver`),
 * et « Recommencer » l'efface. Si le flux est refusé en cours de route (ticket expiré), un nouveau ticket est
 * demandé une fois et la lecture reprend à la même position.
 */
export default function PlayerPage() {
  const { mediaId } = useParams()
  const [params] = useSearchParams()
  const explicitStart = params.has('t')
  const startParam = startFromParams(params)
  const [ticket, setTicket] = useState(null) // null = chargement
  const [resumeKnown, setResumeKnown] = useState(false)
  const [playerKey, setPlayerKey] = useState(0)
  const [error, setError] = useState('')
  const resumeAt = useRef(0)
  const refreshes = useRef(0)
  const { track, discard } = useProgressSaver(mediaId)

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
    refreshes.current = 0
    const controller = new AbortController()
    const setStart = (seconds) => {
      if (controller.signal.aborted) return
      resumeAt.current = seconds
      setResumeKnown(true)
    }
    if (explicitStart) {
      setStart(startParam) // reprise demandée par la fiche (« Reprendre à … »)
    } else {
      setResumeKnown(false)
      // Sans position dans l'URL (ex. rechargement de la page) : dernière position du profil.
      getProgress(mediaId, controller.signal)
        .then((progress) => playAction(progress).startAt, () => 0)
        .then(setStart)
    }
    load(controller.signal)
    return () => controller.abort()
  }, [load, mediaId, explicitStart, startParam])

  const restart = () => {
    discard() // la position en attente ne doit pas repartir après la réinitialisation
    resetProgress(mediaId).catch(() => {}) // au mieux : les prochaines sauvegardes écraseront l'ancienne position
    resumeAt.current = 0
    refreshes.current = 0
    setPlayerKey((key) => key + 1)
  }

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
  } else if (ticket === null || !resumeKnown) {
    content = <Spinner size="lg" label="Préparation de la lecture…" />
  } else {
    content = (
      <VideoPlayer
        key={playerKey}
        src={ticket.url}
        startAt={resumeAt.current}
        onError={onPlaybackError}
        onProgress={track}
        onReady={() => {
          refreshes.current = 0
        }}
      />
    )
  }

  return (
    <section className="player-page">
      <h1 className="visually-hidden">Lecture</h1>
      {!error && (
        <p className="player-page__bar">
          {back}
          {ticket !== null && resumeKnown && (
            <Button variant="secondary" onClick={restart}>
              Recommencer
            </Button>
          )}
        </p>
      )}
      {content}
    </section>
  )
}
