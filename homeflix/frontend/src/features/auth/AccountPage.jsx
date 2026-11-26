import { useState } from 'react'
import Button from '@/components/Button'
import { useAuth } from '@/features/auth/authContext'
import DeleteAccountModal from '@/features/auth/DeleteAccountModal'
import '@/features/auth/AccountPage.css'

const ROLE_LABEL = { USER: 'Utilisateur', ADMIN: 'Administrateur' }

/**
 * « Mon compte » : identité du compte connecté et suppression du compte. La suppression exige le mot de passe, dit
 * clairement ce qui disparaît (profils, favoris, progression, sessions) et ce qui reste (les fichiers médias), puis
 * ferme la session et renvoie à la connexion.
 */
export default function AccountPage() {
  const { account, deleteAccount } = useAuth()
  const [confirming, setConfirming] = useState(false)

  // Lève en cas d'échec : la modale reste ouverte avec le message. En cas de succès, la session est fermée et la garde
  // de route renvoie à la connexion en expliquant que le compte a été supprimé.
  const remove = (password) => deleteAccount(password)

  return (
    <section className="account">
      <h1>Mon compte</h1>

      <dl className="account__identity">
        <div>
          <dt>Identifiant</dt>
          <dd>{account?.username}</dd>
        </div>
        <div>
          <dt>Adresse e-mail</dt>
          <dd>{account?.email}</dd>
        </div>
        <div>
          <dt>Rôle</dt>
          <dd>{ROLE_LABEL[account?.role] ?? account?.role}</dd>
        </div>
      </dl>

      <section className="account__danger" aria-labelledby="account-delete-title">
        <h2 id="account-delete-title">Supprimer mon compte</h2>
        <p>La suppression est définitive. Seront supprimés :</p>
        <ul>
          <li>votre compte et vos sessions ouvertes ;</li>
          <li>tous vos profils ;</li>
          <li>les favoris et la progression de lecture de ces profils.</li>
        </ul>
        <p>Les fichiers médias de la bibliothèque ne sont jamais supprimés.</p>
        <div>
          <Button variant="danger" onClick={() => setConfirming(true)}>
            Supprimer mon compte
          </Button>
        </div>
      </section>

      {confirming && <DeleteAccountModal onConfirm={remove} onClose={() => setConfirming(false)} />}
    </section>
  )
}
