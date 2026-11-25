import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import Button from '@/components/Button'
import ErrorState from '@/components/ErrorState'
import Spinner from '@/components/Spinner'
import { playAction } from '@/features/catalogue/format'
import { resolvePlaybackFailure } from '@/features/player/playbackErrors'
import useProgressSaver from '@/features/player/useProgressSaver'
import VideoPlayer from '@/features/player/VideoPlayer'
import { isAbortError } from '@/services/api'
import { getProgress, resetProgress } from '@/services/library'
import { diagnoseStream, getStreamTicket } from '@/services/streaming'

/** Position de départ de l'URL (`?t=312`, en secondes) ; toute valeur invalide ou négative donne 0. */
export const startFromParams = (params) => {
  const seconds = Number(params.get('t'))
  return Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
}

/**
 * Lecture d'un film : demande un ticket de streaming (`POST /media/{id}/stream-ticket`) puis charge le
 * flux dans le lecteur, à la position `?t=` si elle est donnée, sinon à la dernière position du profil
 * (un film terminé repart du début). La position est sauvegardée pendant la lecture (voir `useProgressSaver`),
 * et « Recommencer » l'efface. Si la lecture échoue en cours de route, on cherche pourquoi (voir
 * `resolvePlaybackFailure`) : ticket expiré → nouveau ticket demandé une fois et reprise à la même position ;
 * sinon un message clair (fichier manquant, accès refusé, format non supporté, connexion perdue…).
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
  const diagnosing = useRef(null) // AbortController du diagnostic en cours
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
    return () => {
      controller.abort()
      diagnosing.current?.abort()
    }
  }, [load, mediaId, explicitStart, startParam])

  const restart = () => {
    discard() // la position en attente ne doit pas repartir après la réinitialisation
    resetProgress(mediaId).catch(() => {}) // au mieux : les prochaines sauvegardes écraseront l'ancienne position
    resumeAt.current = 0
    refreshes.current = 0
    setPlayerKey((key) => key + 1)
  }

  const onPlaybackError = async (mediaError, currentTime) => {
    if (diagnosing.current) return // un diagnostic est déjà en cours pour cet échec
    const controller = new AbortController()
    diagnosing.current = controller
    resumeAt.current = currentTime // la reprise (nouveau ticket ou « Réessayer ») repart d'ici
    let failure
    try {
      failure = await diagnoseStream(ticket.url, controller.signal)
    } catch {
      return // page quittée pendant le diagnostic
    } finally {
      diagnosing.current = null
    }
    const result = resolvePlaybackFailure({
      mediaErrorCode: mediaError?.code,
      failure,
      canRefresh: refreshes.current < 1,
    })
    if (result.type === 'refresh') {
      refreshes.current += 1
      load()
    } else if (result.type === 'error') {
      setTicket(null)
      setError(result.message)
    }
  }

  const retry = () => {
    refreshes.current = 0
    load()
  }

  const back = (
    <Link className="touch-link" to={`/media/${encodeURIComponent(mediaId)}`}>
      Retour à la fiche
    </Link>
  )

  let content
  if (error) {
    content = (
      <ErrorState title="Lecture impossible" description={error} onRetry={retry}>
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
