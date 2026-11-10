import { createContext, useContext } from 'react'
import type { PublicUser, AuthSession } from '../types/booking'

export interface AuthContextValue {
  user: PublicUser | null
  loading: boolean
  login: (input: { email: string; password: string; rememberMe?: boolean }) => Promise<void>
  register: (input: { fullName: string; email: string; phone: string; password: string }) => Promise<void>
  updateProfile: (input: { fullName: string; phone: string }) => Promise<void>
  logout: () => void
  acceptSession: (session: AuthSession) => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within AuthProvider')
  return value
}
