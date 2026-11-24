import { useState } from 'react'
import { useAuth } from '@/features/auth/authContext'
import { hasSeenIntro, markIntroSeen, prefersReducedMotion } from '@/features/intro/introSeen'
import LogoIntro from '@/features/intro/LogoIntro'

/**
 * Joue l'intro du logo avant son contenu (la page de connexion), une seule fois par session de navigation.
 * Pas d'intro pour qui est déjà connecté (la page le renvoie ailleurs aussitôt), ni quand le système demande
 * moins d'animations.
 * @param {object} props
 * @param {React.ReactNode} props.children
 */
export default function IntroGate({ children }) {
  const { status } = useAuth()
  const [over, setOver] = useState(() => hasSeenIntro() || prefersReducedMotion())

  if (over || status === 'authenticated') return children
  return (
    <LogoIntro
      onDone={() => {
        markIntroSeen()
        setOver(true)
      }}
    />
  )
}
