import Button from '@/components/Button'
import '@/components/StateMessage.css'
import { userMessage } from '@/services/errorMessages'

/**
 * Écran « session expirée » : explique pourquoi l'utilisateur est revenu à la connexion et propose
 * de se reconnecter (le formulaire de connexion s'affiche ensuite, la destination `?next=` est conservée).
 * @param {object} props
 * @param {() => void} props.onReconnect
 */
export default function SessionExpiredNotice({ onReconnect }) {
  return (
    <section className="state" role="status">
      <h2 className="state__title">Session expirée</h2>
      <p className="state__description">{userMessage('SESSION_EXPIRED')}</p>
      <div className="state__actions">
        <Button onClick={onReconnect}>Se reconnecter</Button>
      </div>
    </section>
  )
}
