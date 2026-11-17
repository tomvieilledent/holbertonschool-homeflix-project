import { Component } from 'react'
import ErrorState from '@/components/ErrorState'

/**
 * Filet de sécurité : une erreur de rendu affiche un écran d'erreur au lieu d'une page blanche.
 * L'utilisateur ne voit jamais le message technique (il reste dans la console du navigateur).
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @param {(reset: () => void) => React.ReactNode} [props.fallback] Rendu de remplacement ; reçoit `reset`.
 */
export default class ErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error, info) {
    console.error('Erreur de rendu :', error, info.componentStack)
  }

  reset = () => this.setState({ failed: false })

  render() {
    if (!this.state.failed) return this.props.children
    if (this.props.fallback) return this.props.fallback(this.reset)
    return (
      <ErrorState
        title="Oups, quelque chose s’est mal passé"
        description="Cette page n’a pas pu s’afficher. Vos données ne sont pas perdues."
        onRetry={this.reset}
      >
        <a href="/">Retour à l’accueil</a>
      </ErrorState>
    )
  }
}
