import { createContext, useContext } from 'react'

export const AuthContext = createContext(null)

/**
 * Session courante. À utiliser sous `<AuthProvider>`.
 * @returns {{
 *   status: 'loading'|'authenticated'|'anonymous',
 *   account: {id: string, username: string, email: string, role: 'USER'|'ADMIN'}|null,
 *   activeProfileId: string|null,
 *   sessionExpired: boolean,
 *   login: (username: string, password: string) => Promise<void>,
 *   logout: () => Promise<void>,
 *   selectProfile: (profileId: string) => Promise<void>,
 * }}
 */
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth doit être utilisé dans un <AuthProvider>')
  return context
}
