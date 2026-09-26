import { createContext, useContext } from 'react'
import type { PublicUser } from '../types/booking'

export interface AuthContextValue {
  user: PublicUser | null
  loading: boolean
  login: (input: { email: string; password: string }) => Promise<void>
  register: (input: { fullName: string; email: string; phone: string; password: string }) => Promise<void>
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within AuthProvider')
  return value
}
