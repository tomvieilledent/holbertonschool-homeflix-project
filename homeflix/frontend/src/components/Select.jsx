import { useId } from 'react'
import './Field.css'

/**
 * Liste déroulante native avec label toujours visible (mêmes styles que `Field`). Native : le clavier,
 * le lecteur d'écran et le mobile fonctionnent sans code en plus.
 * @param {object} props
 * @param {string} props.label Libellé visible.
 * @param {{value: string, label: string}[]} props.options Choix proposés.
 * @param {string} props.value Valeur sélectionnée.
 * @param {(value: string) => void} props.onChange
 * @param {string} [props.id] Identifiant ; généré si absent.
 * @param {boolean} [props.disabled]
 */
export default function Select({ label, options, value, onChange, id, disabled = false, className = '', ...rest }) {
  const generatedId = useId()
  const selectId = id ?? generatedId

  return (
    <div className={`field ${className}`.trim()}>
      <label className="field__label" htmlFor={selectId}>
        {label}
      </label>
      <select
        id={selectId}
        className="field__input"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        {...rest}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
