import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '@/components/Button'
import ErrorState from '@/components/ErrorState'
import Spinner from '@/components/Spinner'
import { useAuth } from '@/features/auth/authContext'
import DeleteProfileModal from '@/features/auth/DeleteProfileModal'
import ProfileAvatar from '@/features/auth/ProfileAvatar'
import ProfileFormModal from '@/features/auth/ProfileFormModal'
import useProfiles from '@/features/auth/useProfiles'
import { createProfile, deleteProfile, MAX_PROFILES, renameProfile } from '@/services/profiles'
import '@/features/auth/ManageProfilesPage.css'

const plural = (count) => `${count} profil${count > 1 ? 's' : ''}`

/**
 * Gestion des profils du compte : créer (5 au maximum), renommer, supprimer avec confirmation. Un compte garde
 * toujours au moins un profil. Supprimer le profil actif n'en laisse aucun d'actif : l'utilisateur en choisit un
 * autre depuis « Qui regarde ? ».
 */
export default function ManageProfilesPage() {
  const { activeProfileId, forgetProfile } = useAuth()
  const { profiles, setProfiles, loadFailed, reload } = useProfiles()
  const [dialog, setDialog] = useState(null) // { type: 'create' | 'rename' | 'delete', profile? }
  const [notice, setNotice] = useState('')
  const summaryId = useId()
  const lastId = useId()

  if (loadFailed) return <ErrorState onRetry={reload} />
  if (profiles === null) return <Spinner size="lg" label="Chargement des profils…" />

  const atLimit = profiles.length >= MAX_PROFILES
  const onlyOne = profiles.length === 1
  const close = () => setDialog(null)
  const done = (message) => {
    setDialog(null)
    setNotice(message)
  }

  const create = async (name) => {
    const created = await createProfile(name)
    setProfiles((list) => [...list, created])
    done(`Profil « ${created.name} » créé.`)
  }

  const rename = async (name) => {
    const updated = await renameProfile(dialog.profile.id, name)
    setProfiles((list) => list.map((profile) => (profile.id === updated.id ? updated : profile)))
    done(`Profil renommé en « ${updated.name} ».`)
  }

  const remove = async () => {
    const { id, name } = dialog.profile
    await deleteProfile(id)
    setProfiles((list) => list.filter((profile) => profile.id !== id))
    const wasActive = id === activeProfileId
    if (wasActive) forgetProfile(id)
    done(
      `Profil « ${name} » supprimé.${wasActive ? ' Choisissez un autre profil pour continuer à regarder.' : ''}`,
    )
  }

  return (
    <section className="manage-profiles">
      <h1>Gérer les profils</h1>
      <p>
        <Link to="/profiles">Retour au choix du profil</Link>
      </p>

      <div role="status" className="manage-profiles__notice">
        {notice}
      </div>

      <ul className="manage-profiles__list">
        {profiles.map((profile) => (
          <li key={profile.id} className="manage-profiles__item">
            <ProfileAvatar name={profile.name} size="sm" />
            <span className="manage-profiles__name">
              {profile.name}
              {profile.id === activeProfileId && <span className="manage-profiles__badge"> (profil actif)</span>}
            </span>
            <Button
              variant="secondary"
              aria-label={`Renommer le profil ${profile.name}`}
              onClick={() => setDialog({ type: 'rename', profile })}
            >
              Renommer
            </Button>
            <Button
              variant="danger"
              aria-label={`Supprimer le profil ${profile.name}`}
              aria-describedby={onlyOne ? lastId : undefined}
              disabled={onlyOne}
              onClick={() => setDialog({ type: 'delete', profile })}
            >
              Supprimer
            </Button>
          </li>
        ))}
      </ul>

      {onlyOne && (
        <p id={lastId} className="manage-profiles__hint">
          Un compte garde toujours au moins un profil : celui-ci ne peut pas être supprimé.
        </p>
      )}

      <p id={summaryId} className="manage-profiles__hint">
        {atLimit
          ? `Limite atteinte : ${MAX_PROFILES} profils sur ${MAX_PROFILES}. Supprimez un profil pour en créer un autre.`
          : `${plural(profiles.length)} sur ${MAX_PROFILES} (maximum par compte).`}
      </p>
      <Button disabled={atLimit} aria-describedby={summaryId} onClick={() => setDialog({ type: 'create' })}>
        Ajouter un profil
      </Button>

      {dialog?.type === 'create' && <ProfileFormModal onSubmit={create} onClose={close} />}
      {dialog?.type === 'rename' && <ProfileFormModal profile={dialog.profile} onSubmit={rename} onClose={close} />}
      {dialog?.type === 'delete' && <DeleteProfileModal profile={dialog.profile} onConfirm={remove} onClose={close} />}
    </section>
  )
}
