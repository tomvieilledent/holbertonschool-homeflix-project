import { useId, useState } from 'react'
import Button from '@/components/Button'
import Field from '@/components/Field'
import Modal from '@/components/Modal'
import { KNOWN_CODES, userMessage } from '@/services/errorMessages'
import { validateMediaRoot } from '@/services/library'

export const PATH_MAX_LENGTH = 500
export const LABEL_MAX_LENGTH = 60

/** Explication à afficher pour un résultat de validation refusé : notre message pour un code connu, sinon celui du serveur. */
export function validationMessage({ code, message }) {
  if (KNOWN_CODES.includes(code)) return userMessage(code)
  return message || 'Ce dossier ne peut pas être utilisé.'
}

/**
 * Ajout d'un dossier autorisé, en deux temps : « Vérifier » affiche le résultat de la validation (sans rien
 * enregistrer), puis « Ajouter le dossier » enregistre. Modifier le chemin efface le résultat : seul un chemin
 * vérifié valide peut être ajouté. Le serveur valide à nouveau à l'enregistrement.
 * `onSubmit({path, label})` lève une `ApiError` en cas d'échec ; en cas de succès, le parent ferme la modale.
 * @param {object} props
 * @param {(root: {path: string, label?: string}) => Promise<void>} props.onSubmit
 * @param {() => void} props.onClose
 */
export default function AddRootModal({ onSubmit, onClose }) {
  const formId = useId()
  const [path, setPath] = useState('')
  const [label, setLabel] = useState('')
  const [fieldError, setFieldError] = useState('')
  // Résultat de la dernière vérification : { status: 'checking'|'valid'|'invalid'|'failed', path, message? }
  const [check, setCheck] = useState(null)
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)

  const trimmed = path.trim()
  const verified = check?.status === 'valid' && check.path === trimmed

  const verify = async () => {
    if (!trimmed) {
      setFieldError('Indiquez le chemin du dossier.')
      return
    }
    setFieldError('')
    setSaveError('')
    setCheck({ status: 'checking', path: trimmed })
    try {
      const result = await validateMediaRoot({ path: trimmed })
      setCheck(
        result.valid
          ? { status: 'valid', path: trimmed }
          : { status: 'invalid', path: trimmed, message: validationMessage(result) },
      )
    } catch (failure) {
      setCheck({ status: 'failed', path: trimmed, message: failure.message })
    }
  }

  const save = async () => {
    setSaving(true)
    setSaveError('')
    try {
      await onSubmit({ path: trimmed, label: label.trim() || undefined })
    } catch (failure) {
      setSaveError(failure.message)
      setSaving(false)
    }
  }

  // Entrée dans un champ : enregistre si le chemin est vérifié, sinon le vérifie. Géré ici et non par la soumission
  // du formulaire : tant que rien n'est vérifié, le bouton « Ajouter » est désactivé, et un navigateur ne soumet
  // pas un formulaire dont le bouton par défaut est désactivé.
  const submit = (event) => {
    event.preventDefault()
    if (verified) save()
    else verify()
  }
  const onKeyDown = (event) => {
    if (event.key === 'Enter' && event.target.tagName === 'INPUT') submit(event)
  }

  const changePath = (event) => {
    setPath(event.target.value)
    setCheck(null) // le résultat ne vaut que pour le chemin vérifié
    setFieldError('')
    setSaveError('')
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Ajouter un dossier"
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="secondary" loading={check?.status === 'checking'} onClick={verify}>
            Vérifier le dossier
          </Button>
          <Button type="submit" form={formId} disabled={!verified} loading={saving}>
            Ajouter le dossier
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} onKeyDown={onKeyDown} noValidate>
        <Field
          label="Chemin du dossier"
          required
          value={path}
          maxLength={PATH_MAX_LENGTH}
          hint="Chemin vu par HomeFlix (dans son conteneur), par exemple /media/films. Emplacements autorisés : /media et /downloads."
          error={fieldError}
          autoComplete="off"
          spellCheck={false}
          data-autofocus
          onChange={changePath}
        />
        <Field
          label="Libellé (facultatif)"
          value={label}
          maxLength={LABEL_MAX_LENGTH}
          hint="Nom affiché dans la liste. Par défaut, le nom du dossier."
          autoComplete="off"
          onChange={(event) => setLabel(event.target.value)}
        />
        <div className="add-root__result" aria-live="polite">
          {check?.status === 'checking' && <p>Vérification du dossier…</p>}
          {check?.status === 'valid' && <p>Ce dossier peut être ajouté : cliquez sur « Ajouter le dossier ».</p>}
          {(check?.status === 'invalid' || check?.status === 'failed') && <p role="alert">{check.message}</p>}
          {saveError && <p role="alert">{saveError}</p>}
        </div>
      </form>
    </Modal>
  )
}
