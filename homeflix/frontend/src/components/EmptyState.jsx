import '@/components/StateMessage.css'

/**
 * État vide : aucun résultat, liste vide, etc. Message en français, sans détail technique.
 * @param {object} props
 * @param {string} props.title Titre (ex. « Votre liste est vide »).
 * @param {string} [props.description] Explication et piste pour avancer.
 * @param {React.ReactNode} [props.icon] Pictogramme décoratif (masqué aux lecteurs d'écran).
 * @param {React.ReactNode} [props.children] Actions (boutons) affichées sous le texte.
 * @param {'h1'|'h2'} [props.titleAs] `h1` quand cet état est toute la page.
 */
export default function EmptyState({ title, description, icon = '+', children, titleAs: Heading = 'h2' }) {
  return (
    <section className="state state--empty">
      <div className="state__icon" aria-hidden="true">
        {icon}
      </div>
      <Heading className="state__title">{title}</Heading>
      {description && <p className="state__description">{description}</p>}
      {children && <div className="state__actions">{children}</div>}
    </section>
  )
}
