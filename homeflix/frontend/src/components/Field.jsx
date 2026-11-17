import { useId } from 'react'
import './Field.css'

/**
 * Champ de formulaire avec label toujours visible, aide et message d'erreur.
 * Le label est relié à l'input, l'erreur est annoncée (`role="alert"`) et liée via `aria-describedby`.
 * @param {object} props
 * @param {string} props.label Libellé visible (obligatoire : pas de placeholder seul).
 * @param {string} [props.error] Message d'erreur ; passe le champ en `aria-invalid`.
 * @param {string} [props.hint] Aide affichée sous le champ.
 * @param {boolean} [props.required] Ajoute `required` et un astérisque.
 * @param {boolean} [props.disabled] Désactive le champ.
 * @param {string} [props.type] Type de l'input (`text`, `email`, `password`…).
 * @param {string} [props.id] Identifiant ; généré si absent.
 */
export default function Field({
  label,
  error,
  hint,
  required = false,
  disabled = false,
  type = 'text',
  id,
  className = '',
  ...rest
}) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={`field ${error ? 'field--error' : ''} ${className}`.trim()}>
      <label className="field__label" htmlFor={inputId}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <input
        id={inputId}
        className="field__input"
        type={type}
        required={required}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...rest}
      />
      {hint && (
        <p id={hintId} className="field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
