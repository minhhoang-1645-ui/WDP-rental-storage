import type { LucideIcon } from 'lucide-react'
import { LogOut } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'

export interface InternalNavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  group?: string
}

export function InternalPortalLayout({ label, navigation }: { label: string; navigation: InternalNavItem[] }) {
  const { user, logout } = useAuth()

  const groups: { group: string | null; items: InternalNavItem[] }[] = []
  for (const item of navigation) {
    const currentGroup = item.group ?? null
    const existing = groups.find((g) => g.group === currentGroup)
    if (existing) {
      existing.items.push(item)
    } else {
      groups.push({ group: currentGroup, items: [item] })
    }
  }

  return (
    <div className="manager-shell">
      <aside className="manager-sidebar">
        <div>
          <span className="manager-brand">WDP</span>
          <small>{label}</small>
        </div>
        <nav aria-label={`Điều hướng ${label}`}>
          {groups.map(({ group, items }, idx) => (
            <div key={group ?? idx}>
              {group && <div className="manager-nav-header">{group}</div>}
              {items.map(({ to, label: itemLabel, icon: Icon, end }) => (
                <NavLink key={to} to={to} end={end}>
                  <Icon size={18} /> {itemLabel}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="manager-account">
          <span>{user?.fullName}</span>
          <small>{user?.role}</small>
          <button type="button" onClick={logout}>
            <LogOut size={16} /> Đăng xuất
          </button>
        </div>
      </aside>
      <main className="manager-main">
        <Outlet />
      </main>
    </div>
  )
}
