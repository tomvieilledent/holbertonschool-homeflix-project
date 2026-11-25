import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <section>
      <h1>Page introuvable</h1>
      <p>Cette page n’existe pas ou a été déplacée.</p>
      <Link className="touch-link" to="/">
        Retour à l’accueil
      </Link>
    </section>
  )
}
