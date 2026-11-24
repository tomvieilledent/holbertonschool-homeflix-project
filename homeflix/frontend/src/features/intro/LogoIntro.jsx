import { useEffect, useId, useRef, useState } from 'react'
import '@/features/intro/LogoIntro.css'

// Chronologie (ms) : apparition, rotation lente, pression sur le play avec ondes, puis fin.
const APPEAR_MS = 1000
const TURN_AT_MS = 1200
const TURN_MS = 4000
const PRESS_AT_MS = TURN_AT_MS + TURN_MS + 100
const END_AT_MS = 7000

// Lettres F, L, I, X : tracé, décalage horizontal (`--dx`) appliqué pendant la rotation et centre (`cx`, `CENTER_Y`)
// autour duquel chaque lettre se redresse. Le centre est donné en unités du viewBox plutôt que par `fill-box` :
// Firefox calcule mal ce repère pour des éléments d'un <mask> et les lettres partaient sur le côté.
const CENTER_Y = 470.04
const LETTERS = [
  {
    dx: '-45.3px',
    cx: 571.33,
    d: 'M553.1882673942702 498.5H566.8635743519782V476.8028649386085H586.268758526603V465.4195088676671H566.8635743519782V452.9665757162347H589.4774897680765V441.5832196452933H553.1882673942702Z',
  },
  {
    dx: '-21.2px',
    cx: 623.25,
    d: 'M605.3328785811733 498.5H641.1637107776262V487.04024556616645H619.0081855388813V441.5832196452933H605.3328785811733Z',
  },
  {
    dx: '14.1px',
    cx: 663.86,
    d: 'M657.0190995907232 498.5H670.6944065484312V441.5832196452933H657.0190995907232Z',
  },
  {
    dx: '45.7px',
    cx: 708.33,
    d: 'M684.181446111869 498.5H698.6971350613916L703.5866302864939 487.42223738062756C704.8854024556617 484.4427012278308 706.1841746248296 481.4631650750341 707.4829467939973 477.94884038199183H707.7885402455662C709.3165075034107 481.4631650750341 710.6152796725785 484.4427012278308 711.9904502046385 487.42223738062756L717.2619372442019 498.5H732.4652114597544L716.8035470668486 469.8506139154161L731.4720327421555 441.5832196452933H717.0327421555253L712.9072305593452 451.82060027285127C711.7612551159618 454.49454297407914 710.5388813096863 457.47407912687584 709.2401091405185 461.1412005457026H708.9345156889495C707.3301500682129 457.47407912687584 706.1077762619373 454.49454297407914 704.8090040927694 451.82060027285127L700.225102319236 441.5832196452933H685.0218281036836L699.7667121418827 469.2394270122783Z',
  },
]

/**
 * Intro animée du logo, plein écran, avant la page de connexion. Se termine seule après 7 s ou dès que
 * l'utilisateur la passe (bouton « Passer l'intro », Échap ou clic) ; `onDone` est alors appelé une fois.
 * L'animation n'a pas d'information à lire : le logo est annoncé comme une image nommée.
 * @param {object} props
 * @param {() => void} props.onDone
 */
export default function LogoIntro({ onDone }) {
  const maskId = `logo-intro-cut-${useId().replace(/:/g, '')}`
  const [phase, setPhase] = useState('appearing') // 'appearing' | 'idle' | 'turned'
  const [pressed, setPressed] = useState(false)
  const wavesRef = useRef(null)
  const playRef = useRef(null)
  const doneRef = useRef(onDone)
  const finished = useRef(false)

  useEffect(() => {
    doneRef.current = onDone
  })

  const finish = () => {
    if (finished.current) return
    finished.current = true
    doneRef.current()
  }

  useEffect(() => {
    const waves = wavesRef.current

    // Ondes concentriques à partir du centre du triangle « play », sur le fond.
    const ripple = () => {
      const triangle = playRef.current.getBoundingClientRect()
      const x = triangle.left + triangle.width / 3
      const y = triangle.top + triangle.height / 2
      const reach = Math.hypot(window.innerWidth, window.innerHeight) / 10
      for (const delay of [0, 150, 300]) {
        const wave = document.createElement('div')
        wave.className = 'logo-intro__wave'
        wave.style.left = `${x}px`
        wave.style.top = `${y}px`
        waves.appendChild(wave)
        const animation = wave.animate?.(
          [
            { transform: 'scale(1)', opacity: 1 },
            { transform: `scale(${reach * 1.2})`, opacity: 0 },
          ],
          { duration: 1300, delay, easing: 'cubic-bezier(.15,.6,.3,1)', fill: 'both' },
        )
        if (animation) animation.onfinish = () => wave.remove()
        else wave.remove()
      }
    }

    const timers = [
      setTimeout(() => setPhase('idle'), APPEAR_MS),
      setTimeout(() => setPhase('turned'), TURN_AT_MS),
      setTimeout(() => {
        setPressed(true)
        ripple()
      }, PRESS_AT_MS),
      setTimeout(finish, END_AT_MS),
    ]
    return () => {
      timers.forEach(clearTimeout)
      waves.replaceChildren()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chronologie lancée une seule fois ; `finish` n'utilise que des refs
  }, [])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') finish()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const logoClass = [
    'logo-intro__logo',
    phase === 'appearing' && 'is-appearing',
    phase === 'turned' && 'is-turned',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="logo-intro" onClick={finish}>
      <div className="logo-intro__waves" ref={wavesRef} aria-hidden="true" />
      <svg className="logo-intro__svg" viewBox="0 0 1280 720" role="img" aria-label="Homeflix">
        <g className={logoClass}>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="-1000" y="-1000" width="3280" height="2720">
            <rect x="-1000" y="-1000" width="3280" height="2720" fill="#fff" />
            <g fill="#000">
              {LETTERS.map(({ dx, cx, d }) => (
                <g
                  key={dx}
                  className="logo-intro__letter"
                  style={{ '--dx': dx, transformOrigin: `${cx}px ${CENTER_Y}px` }}
                >
                  <path d={d} />
                </g>
              ))}
            </g>
          </mask>
          <g className={`logo-intro__shapes${pressed ? ' is-pressed' : ''}`}>
            <g mask={`url(#${maskId})`} fill="#F68657">
              <polygon
                ref={playRef}
                points="640,86.9 841.6,366.9 438.4,366.9"
                stroke="#F68657"
                strokeWidth="16"
                strokeLinejoin="round"
              />
              <rect x="426" y="428.5" width="428" height="84" rx="18" />
              <rect x="598" y="500" width="84" height="50" />
              <rect x="426" y="537.5" width="428" height="84" rx="18" />
            </g>
          </g>
        </g>
      </svg>
      <button
        type="button"
        className="logo-intro__skip"
        autoFocus
        onClick={(event) => {
          event.stopPropagation()
          finish()
        }}
      >
        Passer l’intro
      </button>
    </div>
  )
}
