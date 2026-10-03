import { LogIn, Menu, Warehouse, X } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { Container } from '../ui/Container'

const links = [['Kho lưu trữ', '/storage'], ['Chọn kích thước', '/size-guide'], ['Tiện ích', '/#amenities'], ['Cách thuê', '/#how-it-works'], ['Cơ sở', '/#facility']]

export function Header() {
  const [open, setOpen] = useState(false)
  const { user } = useAuth()
  const isInternalUser = user?.role === 'MANAGER' || user?.role === 'STAFF' || user?.role === 'ADMIN'
  const accountPath = !user ? '/account/login' : isInternalUser ? '/manager/inquiries' : '/account/reservations'
  const accountLabel = !user ? 'Đăng nhập' : isInternalUser ? 'Quản lý yêu cầu' : 'Yêu cầu của tôi'
  return <header className="sticky top-0 z-50 border-b border-border bg-white/95 backdrop-blur-sm">
    <Container className="flex h-18 items-center justify-between">
      <Link to="/" className="flex items-center gap-2 text-lg font-bold tracking-tight" aria-label="WDP Storage - Trang chủ"><span className="grid size-9 place-items-center rounded-lg bg-navy text-white"><Warehouse size={19} /></span>WDP Storage</Link>
      <nav className="hidden items-center gap-6 lg:flex" aria-label="Điều hướng chính">{links.map(([label, href]) => <NavLink key={label} to={href} className="nav-link">{label}</NavLink>)}</nav>
      <div className="hidden items-center gap-4 lg:flex"><Link to={accountPath} className="nav-link inline-flex items-center gap-2"><LogIn size={16} /> {accountLabel}</Link><Link to="/booking" className="button-primary">Đặt kho nhanh</Link></div>
      <button className="icon-button lg:hidden" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? 'Đóng menu' : 'Mở menu'}>{open ? <X /> : <Menu />}</button>
    </Container>
    {open && <nav id="mobile-nav" className="border-t border-border bg-white px-5 py-4 lg:hidden" aria-label="Điều hướng di động"><div className="mx-auto flex max-w-7xl flex-col">{links.map(([label, href]) => <NavLink key={label} to={href} onClick={() => setOpen(false)} className="border-b border-border py-3 font-medium">{label}</NavLink>)}<Link to={accountPath} className="py-3 font-medium" onClick={() => setOpen(false)}>{accountLabel}</Link><Link to="/booking" className="button-primary mt-3 justify-center" onClick={() => setOpen(false)}>Đặt kho nhanh</Link></div></nav>}
  </header>
}

