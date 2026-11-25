import ConfirmModal from '@/components/ConfirmModal'

/**
 * Confirmation de suppression d'un profil. Prévient que ses favoris et sa progression seront perdus.
 * `onConfirm()` lève une `ApiError` en cas d'échec ; en cas de succès, le parent ferme la modale.
 * @param {object} props
 * @param {{id: string, name: string}} props.profile
 * @param {() => Promise<void>} props.onConfirm
 * @param {() => void} props.onClose
 */
export default function DeleteProfileModal({ profile, onConfirm, onClose }) {
  return (
    <ConfirmModal
      title={`Supprimer le profil « ${profile.name} » ?`}
      confirmLabel="Supprimer le profil"
      onConfirm={onConfirm}
      onClose={onClose}
    >
      <p>
        Les favoris et la progression de lecture de ce profil seront supprimés définitivement. Cette action est
        irréversible.
      </p>
    </ConfirmModal>
  )
}
