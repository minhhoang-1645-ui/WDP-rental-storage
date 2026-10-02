import { useEffect, useState, type PropsWithChildren } from 'react'
import { AUTH_TOKEN_KEY } from '../data/booking'
import { authApi } from '../services/booking'
import type { AuthSession, PublicUser } from '../types/booking'
import { AuthContext, type AuthContextValue } from './auth-context'

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<PublicUser | null>(null)
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem(AUTH_TOKEN_KEY)))

  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY)
    if (!token) return
    authApi.me().then(setUser).catch(() => localStorage.removeItem(AUTH_TOKEN_KEY)).finally(() => setLoading(false))
  }, [])

  const saveSession = (session: AuthSession) => {
    localStorage.setItem(AUTH_TOKEN_KEY, session.token)
    setUser(session.user)
  }

  const value: AuthContextValue = {
    user,
    loading,
    login: async (input) => saveSession(await authApi.login(input)),
    register: async (input) => saveSession(await authApi.register(input)),
    logout: () => {
      // Capture the current bearer token before clearing this browser's session.
      void authApi.logout().catch(() => undefined)
      localStorage.removeItem(AUTH_TOKEN_KEY)
      setUser(null)
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
