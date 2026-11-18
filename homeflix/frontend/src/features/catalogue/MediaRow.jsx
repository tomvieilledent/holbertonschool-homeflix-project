import { Children, useId } from 'react'
import '@/features/catalogue/MediaRow.css'

/**
 * Rangée horizontale de cartes (accueil, catalogue). Les enfants sont les cartes : chacune est un lien
 * focalisable, donc Tab fait défiler la rangée au clavier, et un écran tactile ou une souris la font
 * défiler normalement. Le titre nomme la rangée pour les lecteurs d'écran.
 * @param {object} props
 * @param {string} props.title
 * @param {React.ReactNode} props.children Cartes de la rangée.
 */
export default function MediaRow({ title, children }) {
  const titleId = useId()
  return (
    <section className="media-row" aria-labelledby={titleId}>
      <h2 id={titleId} className="media-row__title">
        {title}
      </h2>
      <ul className="media-row__list">
        {Children.map(children, (child) => (
          <li className="media-row__item">{child}</li>
        ))}
      </ul>
    </section>
  )
}
