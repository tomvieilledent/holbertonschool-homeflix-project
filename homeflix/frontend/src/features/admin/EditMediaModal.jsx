import { useId, useState } from 'react'
import Button from '@/components/Button'
import Field from '@/components/Field'
import Modal from '@/components/Modal'
import {
  changesFrom,
  DESCRIPTION_MAX,
  GENRES_MAX,
  GENRE_MAX_LENGTH,
  initialValues,
  TITLE_MAX,
  validateMetadata,
  YEAR_MAX,
  YEAR_MIN,
} from '@/features/admin/mediaForm'

/**
 * Formulaire accessible d'édition des métadonnées d'un film (titre, description, genres, année), dans une modale.
 * Les limites sont rappelées sous chaque champ et vérifiées avant l'envoi ; seuls les champs modifiés sont envoyés, et
 * rien n'est envoyé si rien n'a changé. `onSubmit(changes)` lève une `ApiError` en cas d'échec ; en cas de succès, le
 * parent ferme la modale.
 * @param {object} props
 * @param {{title: string, description?: string|null, genres?: string[], year?: number|null}} props.media
 * @param {(changes: object) => Promise<void>} props.onSubmit
 * @param {() => void} props.onClose
 */
export default function EditMediaModal({ media, onSubmit, onClose }) {
  const formId = useId()
  const [values, setValues] = useState(() => initialValues(media))
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  const change = (name) => (event) => setValues((current) => ({ ...current, [name]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    const problems = validateMetadata(values)
    setErrors(problems)
    setFormError('')
    if (Object.keys(problems).length > 0) return
    const changes = changesFrom(media, values)
    if (Object.keys(changes).length === 0) {
      onClose() // rien à changer
      return
    }
    setBusy(true)
    try {
      await onSubmit(changes)
    } catch (failure) {
      if (Object.keys(failure.fieldErrors ?? {}).length > 0) setErrors(failure.fieldErrors)
      else setFormError(failure.message)
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Modifier le film"
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form={formId} loading={busy}>
            Enregistrer
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate>
        <Field
          label="Titre"
          required
          value={values.title}
          maxLength={TITLE_MAX + 50} // la limite est vérifiée et expliquée plutôt que silencieusement tronquée
          hint={`${values.title.trim().length} / ${TITLE_MAX} caractères.`}
          error={errors.title}
          autoComplete="off"
          data-autofocus
          onChange={change('title')}
        />
        <Field
          label="Description"
          multiline
          rows={5}
          value={values.description}
          hint={`${values.description.length} / ${DESCRIPTION_MAX} caractères.`}
          error={errors.description}
          onChange={change('description')}
        />
        <Field
          label="Genres"
          value={values.genres}
          hint={`Séparés par des virgules : ${GENRES_MAX} genres au maximum, de ${GENRE_MAX_LENGTH} caractères au plus.`}
          error={errors.genres}
          autoComplete="off"
          onChange={change('genres')}
        />
        <Field
          label="Année"
          type="number"
          inputMode="numeric"
          min={YEAR_MIN}
          max={YEAR_MAX}
          value={values.year}
          hint={`Entre ${YEAR_MIN} et ${YEAR_MAX}. Laissez vide pour la conserver telle quelle.`}
          error={errors.year}
          onChange={change('year')}
        />
        {formError && <p role="alert">{formError}</p>}
      </form>
    </Modal>
  )
}
