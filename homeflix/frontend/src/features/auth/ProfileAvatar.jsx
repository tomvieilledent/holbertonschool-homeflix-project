import '@/features/auth/ProfileAvatar.css'

/** Avatar d'un profil : initiale du nom (l'avatar prédéfini n'a pas d'image). Décoratif : le nom est lu à côté. */
export default function ProfileAvatar({ name, size = 'lg' }) {
  return (
    <span className={`profile-avatar profile-avatar--${size}`} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase()}
    </span>
  )
}
