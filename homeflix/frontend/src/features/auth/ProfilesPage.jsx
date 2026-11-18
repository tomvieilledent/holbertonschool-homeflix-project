import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import Spinner from '@/components/Spinner'
import { useAuth } from '@/features/auth/authContext'
import { safeNext } from '@/features/auth/redirect'
import { isAbortError } from '@/services/api'
import { listProfiles } from '@/services/profiles'
import '@/features/auth/ProfilesPage.css'

/** Bouton d'un profil : initiale (l'avatar prédéfini n'a pas d'image) et nom en texte. */
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
        <span className="profile-choice__avatar" aria-hidden="true">
          {profile.name.trim().charAt(0).toUpperCase()}
        </span>
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
  const [profiles, setProfiles] = useState(null) // null = chargement
  const [loadFailed, setLoadFailed] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [selectError, setSelectError] = useState('')

  const load = useCallback((signal) => {
    setLoadFailed(false)
    listProfiles(signal)
      .then(setProfiles)
      .catch((error) => {
        if (!isAbortError(error)) setLoadFailed(true)
      })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

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

  if (loadFailed) return <ErrorState onRetry={() => load()} />
  if (profiles === null) return <Spinner size="lg" label="Chargement des profils…" />
  if (profiles.length === 0) {
    return (
      <EmptyState
        title="Aucun profil"
        description="Ce compte n’a pas encore de profil de visionnage. Contactez l’administrateur."
      />
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
    </section>
  )
}
