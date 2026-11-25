import { useEffect, useLayoutEffect, useRef } from 'react'
import { FOCUSABLE } from '@/components/focusable'

const focusLost = () => !document.activeElement || document.activeElement === document.body

/**
 * Empêche le focus clavier de se perdre dans la page :
 * - à un changement de page, si l'élément qui avait le focus a disparu, le contenu principal le reçoit (un lien de
 *   l'en-tête, toujours là, le garde) ;
 * - sur une même page, si l'élément qui avait le focus est retiré (film enlevé de la liste, ligne supprimée), le focus
 *   passe à l'élément qui a pris sa place dans l'ordre du clavier.
 * @param {string} pathname Chemin de la page affichée.
 */
export default function useFocusRecovery(pathname) {
  const last = useRef(null) // { element, index } : dernier élément du contenu principal qui a eu le focus
  const previous = useRef(pathname)

  useEffect(() => {
    const remember = ({ target }) => {
      const main = target.closest?.('main')
      if (main) last.current = { element: target, index: [...main.querySelectorAll(FOCUSABLE)].indexOf(target) }
    }
    // Un clic ailleurs abandonne volontairement le focus : rien à rétablir ensuite.
    const forget = () => {
      last.current = null
    }
    const recover = () => {
      const lost = last.current
      if (!lost || lost.element.isConnected || !focusLost()) return
      const main = document.querySelector('main')
      if (!main) return
      const items = main.querySelectorAll(FOCUSABLE)
      last.current = null
      ;(items[Math.min(Math.max(lost.index, 0), items.length - 1)] ?? main).focus()
    }
    const observer = new MutationObserver(recover)
    observer.observe(document.body, { childList: true, subtree: true })
    document.addEventListener('focusin', remember)
    document.addEventListener('pointerdown', forget)
    // Un élément en `autoFocus` (« Passer l’intro ») a pu recevoir le focus avant que l'écoute commence.
    if (!focusLost()) remember({ target: document.activeElement })
    return () => {
      observer.disconnect()
      document.removeEventListener('focusin', remember)
      document.removeEventListener('pointerdown', forget)
    }
  }, [])

  // Effet de mise en page : exécuté avant que l'observateur ci-dessus ne voie l'ancienne page disparaître.
  useLayoutEffect(() => {
    if (previous.current === pathname) return
    previous.current = pathname
    last.current = null
    if (focusLost()) document.querySelector('main')?.focus()
  }, [pathname])
}
