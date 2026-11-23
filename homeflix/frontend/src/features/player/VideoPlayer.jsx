import { useCallback, useEffect, useRef, useState } from 'react'
import Button from '@/components/Button'
import Spinner from '@/components/Spinner'
import { clamp, formatClock, spokenDuration } from '@/features/player/playerUtils'
import '@/features/player/VideoPlayer.css'

const SEEK_STEP = 5 // secondes (flèches gauche et droite)
const SEEK_STEP_LONG = 10 // secondes (J et L)
const VOLUME_STEP = 0.1

/**
 * Lecteur vidéo à contrôles personnalisés, utilisables au clavier et annoncés aux lecteurs d'écran.
 *
 * Raccourcis (le lecteur doit avoir le focus) : Espace ou K lecture/pause, ← → ±5 s, J L ±10 s,
 * ↑ ↓ volume, M muet, F plein écran. Les curseurs de position et de volume gardent leurs flèches natives.
 * Le déplacement dans la vidéo (seek) repose sur HTTP Range côté serveur : on positionne `currentTime`.
 *
 * @param {object} props
 * @param {string} props.src URL du flux (ticket inclus).
 * @param {number} [props.startAt] Position de départ en secondes (ex. reprise après un nouveau ticket).
 * @param {string} [props.label] Nom du lecteur pour les lecteurs d'écran.
 * @param {(error: MediaError|null, currentTime: number) => void} [props.onError] Échec de lecture.
 * @param {() => void} [props.onReady] La vidéo peut démarrer.
 * @param {(position: number, duration: number, options: {immediate: boolean}) => void} [props.onProgress]
 *   Position courante (à chaque avancée) ; `immediate` à la pause et à la fin, pour la sauvegarder tout de suite.
 */
export default function VideoPlayer({ src, startAt = 0, label = 'Lecteur vidéo', onError, onReady, onProgress }) {
  const containerRef = useRef(null)
  const videoRef = useRef(null)
  const [paused, setPaused] = useState(true)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [buffering, setBuffering] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  const canFullscreen = typeof document !== 'undefined' && Boolean(document.fullscreenEnabled)

  useEffect(() => {
    setLoading(true)
    setBuffering(false)
  }, [src])

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === containerRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const reportProgress = (video, immediate) => onProgress?.(video.currentTime, video.duration, { immediate })

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) video.play()?.catch(() => {}) // refus du navigateur : l'état reste « en pause »
    else video.pause()
  }, [])

  const seekTo = useCallback((seconds) => {
    const video = videoRef.current
    if (!video) return
    const max = Number.isFinite(video.duration) ? video.duration : 0
    video.currentTime = clamp(seconds, 0, max)
    setCurrent(video.currentTime)
  }, [])

  const seekBy = useCallback((delta) => seekTo((videoRef.current?.currentTime ?? 0) + delta), [seekTo])

  const changeVolume = useCallback((value) => {
    const video = videoRef.current
    if (!video) return
    video.volume = clamp(value, 0, 1)
    video.muted = video.volume === 0
  }, [])

  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (video) video.muted = !video.muted
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.()
    else containerRef.current?.requestFullscreen?.()?.catch(() => {})
  }, [])

  const onKeyDown = (event) => {
    const { key, target } = event
    if (event.altKey || event.ctrlKey || event.metaKey) return
    // Les curseurs gardent leurs flèches et les boutons leur Espace : touches natives, on n'y touche pas.
    if (target instanceof HTMLInputElement && target.type === 'range' && key.startsWith('Arrow')) return
    if (target instanceof HTMLButtonElement && key === ' ') return

    const volumeNow = () => videoRef.current?.volume ?? 1
    const actions = {
      ' ': togglePlay,
      k: togglePlay,
      ArrowLeft: () => seekBy(-SEEK_STEP),
      ArrowRight: () => seekBy(SEEK_STEP),
      j: () => seekBy(-SEEK_STEP_LONG),
      l: () => seekBy(SEEK_STEP_LONG),
      ArrowUp: () => changeVolume(volumeNow() + VOLUME_STEP),
      ArrowDown: () => changeVolume(volumeNow() - VOLUME_STEP),
      m: toggleMute,
      f: canFullscreen ? toggleFullscreen : undefined,
    }
    const action = actions[key.length === 1 ? key.toLowerCase() : key]
    if (!action) return
    event.preventDefault()
    action()
  }

  const sliderMax = duration > 0 ? duration : 0
  const status = loading ? 'Chargement de la vidéo…' : buffering ? 'Mise en mémoire tampon…' : ''

  return (
    <div
      ref={containerRef}
      className={`player${fullscreen ? ' player--fullscreen' : ''}`}
      role="group"
      aria-label={label}
      aria-describedby="player-shortcuts"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <p id="player-shortcuts" className="visually-hidden">
        Raccourcis : espace ou K lecture et pause, flèches gauche et droite avancer ou reculer de 5 secondes, J et
        L de 10 secondes, flèches haut et bas volume, M son, F plein écran.
      </p>
      <div className="player__stage">
        <video
          ref={videoRef}
          className="player__video"
          src={src}
          preload="metadata"
          playsInline
          onClick={togglePlay}
          onLoadedMetadata={(event) => {
            setDuration(event.currentTarget.duration)
            if (startAt > 0) event.currentTarget.currentTime = startAt
            setLoading(false)
          }}
          onDurationChange={(event) => setDuration(event.currentTarget.duration)}
          onCanPlay={() => {
            setLoading(false)
            setBuffering(false)
            onReady?.()
          }}
          onTimeUpdate={(event) => {
            setCurrent(event.currentTarget.currentTime)
            reportProgress(event.currentTarget, false)
          }}
          onPlay={() => setPaused(false)}
          onPause={(event) => {
            setPaused(true)
            reportProgress(event.currentTarget, true)
          }}
          onEnded={(event) => {
            setPaused(true)
            reportProgress(event.currentTarget, true)
          }}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => setBuffering(false)}
          onSeeked={() => setBuffering(false)}
          onVolumeChange={(event) => {
            setVolume(event.currentTarget.volume)
            setMuted(event.currentTarget.muted)
          }}
          onError={(event) => onError?.(event.currentTarget.error, event.currentTarget.currentTime)}
        />
        {status && (
          <div className="player__status">
            <Spinner size="lg" label={status} />
          </div>
        )}
      </div>

      <div className="player__controls">
        <Button
          variant="ghost"
          aria-label={paused ? 'Lire' : 'Mettre en pause'}
          aria-keyshortcuts="k"
          onClick={togglePlay}
        >
          <span aria-hidden="true">{paused ? '▶' : '❚❚'}</span>
        </Button>

        <span className="player__time" aria-hidden="true">
          {formatClock(current)} / {formatClock(duration)}
        </span>

        <input
          className="player__slider player__slider--seek"
          type="range"
          aria-label="Position dans la vidéo"
          aria-valuetext={`${spokenDuration(current)} sur ${spokenDuration(duration)}`}
          min={0}
          max={sliderMax}
          step={1}
          value={Math.min(current, sliderMax)}
          disabled={sliderMax === 0}
          onChange={(event) => seekTo(Number(event.target.value))}
        />

        <Button
          variant="ghost"
          aria-label={muted || volume === 0 ? 'Activer le son' : 'Couper le son'}
          aria-pressed={muted || volume === 0}
          aria-keyshortcuts="m"
          onClick={toggleMute}
        >
          <span aria-hidden="true">{muted || volume === 0 ? 'Muet' : 'Son'}</span>
        </Button>
        <input
          className="player__slider player__slider--volume"
          type="range"
          aria-label="Volume"
          aria-valuetext={`${Math.round((muted ? 0 : volume) * 100)} pour cent`}
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          onChange={(event) => changeVolume(Number(event.target.value))}
        />

        {canFullscreen && (
          <Button
            variant="ghost"
            aria-label={fullscreen ? 'Quitter le plein écran' : 'Plein écran'}
            aria-pressed={fullscreen}
            aria-keyshortcuts="f"
            onClick={toggleFullscreen}
          >
            <span aria-hidden="true">{fullscreen ? '⤡' : '⤢'}</span>
          </Button>
        )}
      </div>
    </div>
  )
}
