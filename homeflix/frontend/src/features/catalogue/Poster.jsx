import '@/features/catalogue/Poster.css'

/**
 * Affiche d'un film (format 2:3). Sans image, un pictogramme de remplacement : le contrat autorise
 * `posterUrl: null`. L'image est décorative (`alt=""`) car le titre est toujours écrit à côté.
 * @param {object} props
 * @param {string|null} [props.url] URL de l'affiche.
 */
export default function Poster({ url }) {
  return (
    <div className="poster">
      {url ? (
        <img src={url} alt="" loading="lazy" />
      ) : (
        <span className="poster__placeholder" aria-hidden="true">
          ▶
        </span>
      )}
    </div>
  )
}
