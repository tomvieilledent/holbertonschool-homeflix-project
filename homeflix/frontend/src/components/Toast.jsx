import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ToastContext } from '@/components/toastContext'
import './Toast.css'

const DEFAULT_DURATION = 6000
let nextId = 1

function ToastItem({ toast, onDismiss }) {
  const timer = useRef(null)

  const pause = useCallback(() => clearTimeout(timer.current), [])
  const start = useCallback(() => {
    pause()
    if (toast.duration > 0) timer.current = setTimeout(() => onDismiss(toast.id), toast.duration)
  }, [toast.id, toast.duration, onDismiss, pause])

  useEffect(() => {
    start()
    return pause
  }, [start, pause])

  return (
    <div
      className={`toast toast--${toast.variant}`}
      role={toast.variant === 'error' ? 'alert' : 'status'}
      onMouseEnter={pause}
      onMouseLeave={start}
      onFocus={pause}
      onBlur={start}
    >
      <span className="toast__message">{toast.message}</span>
      <button
        type="button"
        className="toast__close"
        aria-label="Fermer la notification"
        onClick={() => onDismiss(toast.id)}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  )
}

/**
 * Fournit `useToast()` et affiche les notifications dans une région `aria-live`.
 * Le minuteur d'auto-fermeture se met en pause au survol et au focus ; `duration: 0` le désactive.
 * @param {object} props
 * @param {React.ReactNode} props.children
 */
export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), [])
  const show = useCallback((message, { variant = 'info', duration = DEFAULT_DURATION } = {}) => {
    const id = nextId++
    setToasts((list) => [...list, { id, message, variant, duration }])
    return id
  }, [])
  const value = useMemo(() => ({ show, dismiss }), [show, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" aria-live="polite" aria-relevant="additions text">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}
