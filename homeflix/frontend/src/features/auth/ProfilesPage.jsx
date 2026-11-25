import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import '@/components/Button.css'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import Spinner from '@/components/Spinner'
import { useAuth } from '@/features/auth/authContext'
import ProfileAvatar from '@/features/auth/ProfileAvatar'
import { safeNext } from '@/features/auth/redirect'
import useProfiles from '@/features/auth/useProfiles'
import '@/features/auth/ProfilesPage.css'

/** Bouton d'un profil : avatar et nom en texte. */
function ProfileButton({ profile, active, disabled, onSelect }) {
  return (
    <li>
      <button
        type="button"
        className="profile-choice"
        aria-current={active || undefined}
        disabled={disabled}
        onClick={() => onSelect(profile)}
      >
        <ProfileAvatar name={profile.name} />
        <span className="profile-choice__name">{profile.name}</span>
      </button>
    </li>
  )
}

/** « Qui regarde ? » : choisit le profil actif puis revient à la destination demandée (ou l'accueil). */
export default function ProfilesPage() {
  const { activeProfileId, selectProfile } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { profiles, loadFailed, reload } = useProfiles() // profiles : null = chargement
  const [selecting, setSelecting] = useState(false)
  const [selectError, setSelectError] = useState('')
  const autoSelected = useRef(false)

  const onSelect = async (profile) => {
    setSelectError('')
    setSelecting(true)
    try {
      await selectProfile(profile.id)
      navigate(safeNext(params.get('next')), { replace: true })
    } catch (error) {
      setSelectError(error.message)
      setSelecting(false)
    }
  }

  // Un seul profil et aucun actif : inutile de demander « Qui regarde ? ». Une seule tentative (ref) :
  // si elle échoue, on affiche la liste avec l'erreur. Avec un profil déjà actif (menu « Changer de
  // profil »), l'écran reste affiché.
  const onlyProfile = profiles?.length === 1 && !activeProfileId ? profiles[0] : null
  useEffect(() => {
    if (onlyProfile && !autoSelected.current) {
      autoSelected.current = true
      onSelect(onlyProfile)
    }
  }, [onlyProfile]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loadFailed) return <ErrorState onRetry={reload} />
  if (profiles === null || (onlyProfile && !selectError)) {
    return <Spinner size="lg" label="Chargement des profils…" />
  }
  if (profiles.length === 0) {
    return (
      <EmptyState title="Aucun profil" description="Ce compte n’a pas encore de profil de visionnage.">
        <Link className="btn btn--primary" to="/profiles/manage">
          Créer un profil
        </Link>
      </EmptyState>
    )
  }

  return (
    <section className="profiles">
      <h1>Qui regarde ?</h1>
      {selectError && <p role="alert">{selectError}</p>}
      <ul className="profiles__list">
        {profiles.map((profile) => (
          <ProfileButton
            key={profile.id}
            profile={profile}
            active={profile.id === activeProfileId}
            disabled={selecting}
            onSelect={onSelect}
          />
        ))}
      </ul>
      <Link className="profiles__manage touch-link" to="/profiles/manage">
        Gérer les profils
      </Link>
    </section>
  )
}
