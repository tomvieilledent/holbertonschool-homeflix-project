import { useEffect, useState } from 'react'
import Field from '@/components/Field'
import Select from '@/components/Select'
import useDebouncedValue from '@/hooks/useDebouncedValue'
import '@/features/catalogue/CatalogueFilters.css'

export const SEARCH_DELAY = 300 // ms entre la dernière frappe et la recherche
export const SEARCH_MAX_LENGTH = 100 // limite du contrat (`q`)

/**
 * Recherche par titre et filtre par genre. La valeur de référence est l'URL (`q`, `genre`) : le champ
 * l'affiche, et suit les retours arrière. La saisie n'est envoyée qu'après `SEARCH_DELAY` ms sans frappe.
 * @param {object} props
 * @param {string} props.query Recherche courante (de l'URL).
 * @param {string} props.genre Genre courant (de l'URL), vide pour tous.
 * @param {string[]} props.genres Genres proposés (vide : le sélecteur est masqué).
 * @param {(query: string) => void} props.onQueryChange Appelé après le délai, avec la saisie nettoyée.
 * @param {(genre: string) => void} props.onGenreChange Appelé tout de suite au choix d'un genre.
 */
export default function CatalogueFilters({ query, genre, genres, onQueryChange, onGenreChange }) {
  const [text, setText] = useState(query)
  const debounced = useDebouncedValue(text, SEARCH_DELAY).trim()

  // Retour arrière ou lien : l'URL change, le champ la suit.
  useEffect(() => {
    setText((current) => (current.trim() === query ? current : query))
  }, [query])

  // Saisie stabilisée : l'URL (donc la recherche) suit le champ.
  useEffect(() => {
    if (debounced !== query) onQueryChange(debounced)
    // `query` volontairement absent : seul un changement de la saisie déclenche une recherche.
  }, [debounced]) // eslint-disable-line react-hooks/exhaustive-deps

  const options = [{ value: '', label: 'Tous les genres' }, ...genres.map((name) => ({ value: name, label: name }))]
  if (genre && !genres.includes(genre)) options.push({ value: genre, label: genre })

  return (
    <form className="catalogue-filters" role="search" aria-label="Rechercher dans le catalogue" onSubmit={(e) => e.preventDefault()}>
      <Field
        label="Rechercher un titre"
        type="search"
        name="q"
        value={text}
        maxLength={SEARCH_MAX_LENGTH}
        autoComplete="off"
        onChange={(event) => setText(event.target.value)}
      />
      {genres.length > 0 && <Select label="Genre" options={options} value={genre} onChange={onGenreChange} />}
    </form>
  )
}
