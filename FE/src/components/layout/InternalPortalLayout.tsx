import { startTransition, useEffect, useRef, type ReactNode } from "react";
import {
  LogOut,
  Menu,
  ShieldCheck,
  Warehouse,
  X,
  type LucideIcon,
} from "lucide-react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { label as roleLabel } from "../manager/portal-data";
export interface InternalNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  group?: string;
}
export function InternalPortalLayout({
  label,
  navigation,
  pageNavigation = [],
}: {
  label: string;
  navigation: InternalNavItem[];
  // Extra route names are used in the breadcrumb only, never added to either menu.
  pageNavigation?: Pick<InternalNavItem, "to" | "label" | "end">[];
}) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const signOut = () => {
    startTransition(() => {
      logout();
      navigate("/account/login", { replace: true });
    });
  };
  const mobile = useRef<HTMLDialogElement>(null);
  const groups: Array<{ group: string; items: InternalNavItem[] }> = [];
  for (const item of navigation) {
    const group = item.group ?? "Điều hướng";
    const found = groups.find((g) => g.group === group);
    if (found) found.items.push(item);
    else groups.push({ group, items: [item] });
  }
  useEffect(() => {
    mobile.current?.close();
    window.scrollTo(0, 0);
  }, [location.pathname]);
  const active = [...navigation, ...pageNavigation]
    .filter((item) =>
      item.end
        ? location.pathname === item.to
        : location.pathname.startsWith(item.to),
    )
    .sort((a, b) => b.to.length - a.to.length)[0];
  const brand: ReactNode = (
    <Link
      className="portal-brand"
      to={
        user?.role === "ADMIN"
          ? "/admin"
          : user?.role === "STAFF"
            ? "/staff"
            : "/manager"
      }
    >
      <span>
        <Warehouse size={23} />
      </span>
      <div>
        <strong>
          WDP <em>Storage</em>
        </strong>
        <small>{label}</small>
      </div>
    </Link>
  );
  const nav = (
    <nav aria-label={`Điều hướng ${label}`}>
      {groups.map(({ group, items }) => (
        <div key={group}>
          <div className="manager-nav-header">{group}</div>
          {items.map(({ to, label: itemLabel, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}>
              <Icon size={17} />
              <span>{itemLabel}</span>
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
  const account = (
    <div className="manager-account">
      <div className="portal-account-avatar">{user?.fullName.slice(0, 1)}</div>
      <div>
        <strong>{user?.fullName}</strong>
        <small>{roleLabel(user?.role)}</small>
      </div>
      <button
        className="portal-logout"
        type="button"
        aria-label="Đăng xuất"
        title="Đăng xuất"
        onClick={signOut}
      >
        <LogOut size={18} />
      </button>
    </div>
  );
  return (
    <div className="manager-shell portal-enhanced">
      <aside className="manager-sidebar">
        {brand}
        {nav}
        {account}
      </aside>
      <div className="portal-workspace">
        <header className="portal-topbar">
          <div>
            <button
              className="icon-button portal-menu"
              aria-label="Mở điều hướng"
              onClick={() => mobile.current?.showModal()}
            >
              <Menu size={19} />
            </button>
            <span>{label}</span>
            <span className="portal-topbar-divider">/</span>
            <strong>{active?.label ?? "Hồ sơ chi tiết"}</strong>
          </div>
          <div className="portal-topbar-actions">
            {user?.role === "ADMIN" && (
              <Link
                className="portal-admin-link"
                to={
                  location.pathname.startsWith("/admin/facility")
                    ? "/admin"
                    : "/admin/facility"
                }
              >
                <ShieldCheck size={16} />
                {location.pathname.startsWith("/admin/facility")
                  ? "Quản trị hệ thống"
                  : "Điều hành cơ sở"}
              </Link>
            )}
            <span className="portal-role">{roleLabel(user?.role)}</span>
          </div>
        </header>
        <main className="manager-main" id="portal-main">
          <Outlet />
        </main>
      </div>
      <dialog
        ref={mobile}
        className="portal-mobile-nav"
        aria-label="Điều hướng nội bộ"
      >
        <button
          className="icon-button portal-mobile-close"
          aria-label="Đóng điều hướng"
          onClick={() => mobile.current?.close()}
        >
          <X size={18} />
        </button>
        {brand}
        {nav}
        {account}
      </dialog>
    </div>
  );
}
