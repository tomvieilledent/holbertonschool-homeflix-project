import { useEffect, useState } from 'react'

/**
 * Valeur qui ne suit `value` qu'après `delay` ms sans changement (saisie de recherche, par exemple).
 * @template T
 * @param {T} value
 * @param {number} [delay] Délai en millisecondes.
 * @returns {T}
 */
export default function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
