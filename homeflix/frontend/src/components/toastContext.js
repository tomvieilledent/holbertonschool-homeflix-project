import { createContext, useContext } from 'react'

export const ToastContext = createContext(null)

/**
 * Accès aux toasts. À utiliser sous `<ToastProvider>`.
 * @returns {{ show: (message: string, options?: { variant?: 'info'|'success'|'error', duration?: number }) => number, dismiss: (id: number) => void }}
 */
export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast doit être utilisé dans un <ToastProvider>')
  return context
}
