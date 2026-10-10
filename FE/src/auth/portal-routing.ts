import type { PublicUser } from '../types/booking'

export function portalDestination(role: PublicUser['role']) {
  if (role === 'MANAGER') return '/manager'
  if (role === 'STAFF') return '/staff'
  if (role === 'ADMIN') return '/admin'
  return '/customer'
}
