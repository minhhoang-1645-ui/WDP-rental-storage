import { LogIn, Menu, Warehouse, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { portalDestination } from "../../auth/portal-routing";
import { Container } from "../ui/Container";
import { ActivityBell } from '../../activity/ActivityCenter';

const links = [
  ["Kho lưu trữ", "/storage"],
  ["Chọn kích thước", "/size-guide"],
  ["Tiện ích", "/#amenities"],
  ["Cách thuê", "/#how-it-works"],
  ["Cơ sở", "/#facility"],
];

export function Header() {
  const [open, setOpen] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); menuTrigger.current?.focus(); } };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);
  const { user } = useAuth();
  const location = useLocation();
  const isInternalUser =
    user?.role === "MANAGER" ||
    user?.role === "STAFF" ||
    user?.role === "ADMIN";
  const accountPath = !user
    ? "/account/login"
    : isInternalUser
      ? portalDestination(user.role)
      : "/customer";
  const accountLabel = !user
    ? "Đăng nhập"
    : {
        STAFF: "Khu nhân viên",
        MANAGER: "Khu quản lý",
        ADMIN: "Khu quản trị",
        CUSTOMER: "Khu vực của tôi",
      }[user.role];
  const actionPath = isInternalUser ? accountPath : "/booking";
  const actionLabel = isInternalUser ? "Mở khu vực làm việc" : "Đặt kho nhanh";
  return (
    <header className="public-header sticky top-0 z-50 border-b border-border bg-white/95 backdrop-blur-sm">
      <Container className="flex h-18 items-center justify-between">
        <Link
          to="/"
          className="public-brand flex items-center gap-2 text-lg font-bold tracking-tight"
          aria-label="WDP Storage - Trang chủ"
        >
          <span className="grid size-9 place-items-center rounded-lg bg-navy text-white">
            <Warehouse size={19} />
          </span>
          <span className="public-wordmark">WDP <em>Storage</em><small>Không gian vừa với bạn</small></span>
        </Link>
        <nav
          className="hidden items-center gap-6 lg:flex"
          aria-label="Điều hướng chính"
        >
          {links.map(([label, href]) => href.includes('#') ? <Link key={label} to={href} className="nav-link" aria-current={location.pathname === '/' && location.hash === href.slice(1) ? 'location' : undefined}>{label}</Link> : (
            <NavLink key={label} to={href} className="nav-link">
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden items-center gap-4 lg:flex">
          {user && <ActivityBell />}
          <Link
            to={accountPath}
            className="nav-link inline-flex items-center gap-2"
          >
            <LogIn size={16} /> {accountLabel}
          </Link>
          <Link to={actionPath} className="button-primary">
            {actionLabel}
          </Link>
        </div>
        {user && <div className="lg:hidden"><ActivityBell /></div>}
        <button
          ref={menuTrigger}
          className="icon-button lg:hidden"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Đóng menu" : "Mở menu"}
        >
          {open ? <X /> : <Menu />}
        </button>
      </Container>
      {open && (
        <nav
          id="mobile-nav"
          className="border-t border-border bg-white px-5 py-4 lg:hidden"
          aria-label="Điều hướng di động"
        >
          <div className="mx-auto flex max-w-7xl flex-col">
            {links.map(([label, href]) => href.includes('#') ? <Link key={label} to={href} onClick={() => setOpen(false)} className="border-b border-border py-3 font-medium" aria-current={location.pathname === '/' && location.hash === href.slice(1) ? 'location' : undefined}>{label}</Link> : (
              <NavLink
                key={label}
                to={href}
                onClick={() => setOpen(false)}
                className="border-b border-border py-3 font-medium"
              >
                {label}
              </NavLink>
            ))}
            <Link
              to={accountPath}
              className="py-3 font-medium"
              onClick={() => setOpen(false)}
            >
              {accountLabel}
            </Link>
            <Link
              to={actionPath}
              className="button-primary mt-3 justify-center"
              onClick={() => setOpen(false)}
            >
              {actionLabel}
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
