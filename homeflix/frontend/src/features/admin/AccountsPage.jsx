import { useCallback, useEffect, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import Button from '@/components/Button'
import ConfirmModal from '@/components/ConfirmModal'
import DataTable from '@/components/DataTable'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import Pagination from '@/components/Pagination'
import Skeleton from '@/components/Skeleton'
import CreateAccountModal from '@/features/admin/CreateAccountModal'
import ResetPasswordModal from '@/features/admin/ResetPasswordModal'
import { useAuth } from '@/features/auth/authContext'
import { pageFromParams } from '@/features/catalogue/CataloguePage'
import { isAbortError } from '@/services/api'
import { createAccount, deleteAccount, listAccounts, resetPassword, updateAccount } from '@/services/accounts'
import '@/features/admin/AccountsPage.css'

const PAGE_SIZE = 20
const ROLE_LABEL = { USER: 'Utilisateur', ADMIN: 'Administrateur' }
const accountsUrl = (page) => (page <= 1 ? '/admin/comptes' : `/admin/comptes?page=${page}`)

function AccountsSkeleton() {
  return (
    <>
      <span role="status" className="visually-hidden">
        Chargement des comptes
      </span>
      <div className="accounts__skeleton" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((row) => (
          <Skeleton key={row} variant="rect" width="100%" height={48} />
        ))}
      </div>
    </>
  )
}

/**
 * Gestion des comptes et des rôles (ADMIN) : liste paginée, création, activation et désactivation, changement de
 * rôle, réinitialisation du mot de passe, suppression. Les actions destructives demandent confirmation ; le serveur
 * reste l'arbitre (`LAST_ADMIN`), l'écran n'empêche d'avance que ce qu'il sait : son propre compte, et le dernier
 * administrateur quand la liste tient sur une page.
 */
export default function AccountsPage() {
  const { account: me } = useAuth()
  const [params] = useSearchParams()
  const page = pageFromParams(params)
  const [data, setData] = useState(null) // null = chargement
  const [error, setError] = useState(null)
  const [dialog, setDialog] = useState(null) // { type: 'create' | 'reset' | 'toggle' | 'role' | 'delete', account? }
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(
    (signal) => {
      setError(null)
      listAccounts({ page: page - 1, size: PAGE_SIZE }, signal)
        .then(setData)
        .catch((failure) => {
          if (!isAbortError(failure)) setError(failure)
        })
    },
    [page],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const close = () => setDialog(null)
  /** Lance l'action ; en cas de succès, ferme la modale, annonce le résultat et recharge la page. */
  const run = async (action, message) => {
    await action()
    setDialog(null)
    setActionError('')
    setNotice(message)
    load()
  }

  /** Activation directe (non destructive) : pas de confirmation. */
  const activate = async (account) => {
    setBusyId(account.id)
    setActionError('')
    try {
      await updateAccount(account.id, { enabled: true })
      setNotice(`Compte « ${account.username} » activé.`)
      load()
    } catch (failure) {
      setActionError(failure.message)
    } finally {
      setBusyId(null)
    }
  }

  if (error) return <ErrorState description={error.message} onRetry={() => load()} />
  if (data === null) {
    return (
      <section>
        <h2>Comptes</h2>
        <AccountsSkeleton />
      </section>
    )
  }
  if (data.totalPages > 0 && page > data.totalPages) {
    return <Navigate to={accountsUrl(data.totalPages)} replace /> // page hors limites (liste raccourcie)
  }

  // Le dernier administrateur n'est connu que si toute la liste est affichée.
  const enabledAdmins = data.totalPages <= 1 ? data.items.filter((a) => a.role === 'ADMIN' && a.enabled) : null
  const isLastAdmin = (account) => enabledAdmins?.length === 1 && enabledAdmins[0].id === account.id
  const isMe = (account) => account.id === me?.id
  const locked = (account) => isMe(account) || isLastAdmin(account)

  const columns = [
    {
      key: 'username',
      header: 'Identifiant',
      rowHeader: true,
      render: (account) => (
        <>
          {account.username}
          {isMe(account) && <span className="accounts__badge"> (vous)</span>}
        </>
      ),
    },
    { key: 'email', header: 'E-mail', render: (account) => account.email },
    { key: 'role', header: 'Rôle', render: (account) => ROLE_LABEL[account.role] ?? account.role },
    {
      key: 'state',
      header: 'État',
      render: (account) => (
        <>
          {account.enabled ? 'Actif' : 'Désactivé'}
          {account.mustChangePassword && <span className="accounts__badge"> · mot de passe temporaire</span>}
          {isLastAdmin(account) && <span className="accounts__badge"> · dernier administrateur</span>}
        </>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (account) => (
        <div className="accounts__actions">
          {account.enabled ? (
            <Button
              variant="secondary"
              disabled={locked(account)}
              aria-label={`Désactiver le compte ${account.username}`}
              onClick={() => setDialog({ type: 'toggle', account })}
            >
              Désactiver
            </Button>
          ) : (
            <Button
              variant="secondary"
              loading={busyId === account.id}
              aria-label={`Activer le compte ${account.username}`}
              onClick={() => activate(account)}
            >
              Activer
            </Button>
          )}
          <Button
            variant="secondary"
            disabled={account.role === 'ADMIN' && locked(account)}
            aria-label={`${account.role === 'ADMIN' ? 'Rétrograder en utilisateur' : 'Promouvoir administrateur'} le compte ${account.username}`}
            onClick={() => setDialog({ type: 'role', account })}
          >
            {account.role === 'ADMIN' ? 'Rétrograder' : 'Promouvoir'}
          </Button>
          <Button
            variant="secondary"
            aria-label={`Réinitialiser le mot de passe de ${account.username}`}
            onClick={() => setDialog({ type: 'reset', account })}
          >
            Mot de passe
          </Button>
          <Button
            variant="danger"
            disabled={locked(account)}
            aria-label={`Supprimer le compte ${account.username}`}
            onClick={() => setDialog({ type: 'delete', account })}
          >
            Supprimer
          </Button>
        </div>
      ),
    },
  ]

  const target = dialog?.account
  return (
    <section className="accounts">
      <div className="accounts__header">
        <h2>Comptes</h2>
        <Button onClick={() => setDialog({ type: 'create' })}>Créer un compte</Button>
      </div>

      <div role="status" className="accounts__notice">
        {notice}
      </div>
      {actionError && <p role="alert">{actionError}</p>}

      {data.items.length === 0 ? (
        <EmptyState title="Aucun compte" description="Aucun compte à afficher pour le moment." />
      ) : (
        <>
          <p className="accounts__count">
            {data.total} compte{data.total > 1 ? 's' : ''}
          </p>
          <DataTable caption="Comptes" columns={columns} rows={data.items} />
          <p className="accounts__hint">
            Vous ne pouvez pas désactiver, rétrograder ni supprimer votre propre compte depuis cet écran, et il doit
            toujours rester au moins un administrateur actif.
          </p>
          <Pagination page={page} totalPages={data.totalPages} hrefFor={accountsUrl} label="Pagination des comptes" />
        </>
      )}

      {dialog?.type === 'create' && (
        <CreateAccountModal
          onSubmit={(account) =>
            run(
              () => createAccount(account),
              `Compte « ${account.username} » créé.`,
            )
          }
          onClose={close}
        />
      )}
      {dialog?.type === 'reset' && (
        <ResetPasswordModal
          account={target}
          onSubmit={(temporaryPassword) =>
            run(
              () => resetPassword(target.id, temporaryPassword),
              `Mot de passe de « ${target.username} » réinitialisé.`,
            )
          }
          onClose={close}
        />
      )}
      {dialog?.type === 'toggle' && (
        <ConfirmModal
          title={`Désactiver le compte « ${target.username} » ?`}
          confirmLabel="Désactiver le compte"
          onConfirm={() =>
            run(() => updateAccount(target.id, { enabled: false }), `Compte « ${target.username} » désactivé.`)
          }
          onClose={close}
        >
          <p>
            Ses sessions sont fermées immédiatement et il ne pourra plus se connecter. Vous pourrez le réactiver à
            tout moment.
          </p>
        </ConfirmModal>
      )}
      {dialog?.type === 'role' && (
        <ConfirmModal
          title={
            target.role === 'ADMIN'
              ? `Retirer les droits d’administrateur de « ${target.username} » ?`
              : `Donner les droits d’administrateur à « ${target.username} » ?`
          }
          confirmLabel={target.role === 'ADMIN' ? 'Rétrograder' : 'Promouvoir'}
          variant={target.role === 'ADMIN' ? 'danger' : 'primary'}
          onConfirm={() =>
            run(
              () => updateAccount(target.id, { role: target.role === 'ADMIN' ? 'USER' : 'ADMIN' }),
              target.role === 'ADMIN'
                ? `« ${target.username} » est maintenant utilisateur.`
                : `« ${target.username} » est maintenant administrateur.`,
            )
          }
          onClose={close}
        >
          <p>
            {target.role === 'ADMIN'
              ? 'Ce compte perdra l’accès à l’administration.'
              : 'Ce compte pourra gérer les comptes, la bibliothèque et les téléchargements.'}
          </p>
        </ConfirmModal>
      )}
      {dialog?.type === 'delete' && (
        <ConfirmModal
          title={`Supprimer le compte « ${target.username} » ?`}
          confirmLabel="Supprimer le compte"
          onConfirm={() => run(() => deleteAccount(target.id), `Compte « ${target.username} » supprimé.`)}
          onClose={close}
        >
          <p>
            Le compte, ses profils, ses favoris et sa progression de lecture seront supprimés définitivement. Les
            fichiers médias ne sont jamais supprimés. Cette action est irréversible.
          </p>
        </ConfirmModal>
      )}
    </section>
  )
}
