import '../../styles/internal-web.css';
import { listMemoryKey } from '../workspace/internal-list-memory';
import { safeSessionStorage } from '../../services/browser-storage';
import { startTransition, useEffect, useRef, useState, type ReactNode } from "react";
import {
  LogOut,
  Menu,
  Warehouse,
  X,
  type LucideIcon,
} from "lucide-react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { label as roleLabel } from "../manager/portal-data";
import { NavigationGroup } from '../workspace/NavigationGroup';
import { ActivityBell, ActivityRefreshNote } from '../../activity/ActivityCenter';
import { useActivity } from '../../activity/context';
import { actionCountForPath } from '../../utils/notification-tools';
const matchesPath = (pathname: string, path: string) => pathname === path || pathname.startsWith(path + '/');
const normalizeNavigation = (text: string) => text.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim();
export interface InternalNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  group?: string;
  match?: readonly string[];
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
  const activity = useActivity();
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => { if (user) safeSessionStorage.setItem(listMemoryKey(user.id, location.pathname), location.pathname + location.search); }, [user, location.pathname, location.search]);
  const [navigationFilter, setNavigationFilter] = useState({ path: location.pathname, value: '' });
  const navigationSearch = navigationFilter.path === location.pathname ? navigationFilter.value : '';
  const signOut = () => {
    startTransition(() => {
      logout();
      navigate("/account/login", { replace: true });
    });
  };
  const mobile = useRef<HTMLDialogElement>(null);
  const accountDialog = useRef<HTMLDialogElement>(null);
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
        : matchesPath(location.pathname, item.to),
    )
    .sort((a, b) => b.to.length - a.to.length)[0];
  const parent = navigation.find(item => item.to !== active?.to
    && item.match?.some(path => matchesPath(location.pathname, path)));
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
          NestBox <em>Storage</em>
        </strong>
        <small>{label}</small>
      </div>
    </Link>
  );
  const nav = (
    <nav aria-label={`Điều hướng ${label}`}>
      {navigation.length > 8 && <label className="workspace-nav-search"><span>Tìm chức năng</span><input type="search" value={navigationSearch} onChange={event => setNavigationFilter({ path: location.pathname, value: event.target.value })} placeholder="Đặt kho, bàn giao, hóa đơn…" /></label>}
      {groups.map(({ group, items }, index) => {
        const matching = items.filter(item => normalizeNavigation(item.label).includes(normalizeNavigation(navigationSearch.trim())));
        if (!matching.length) return null;
        const active = items.some(item => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)) || item.match?.some(path => location.pathname === path || location.pathname.startsWith(path + '/')));
        return <NavigationGroup key={`${group}:${Boolean(navigationSearch)}:`} title={group} active={active} count={actionCountForPath(activity.entries, items.flatMap(item => [item.to,...item.match ?? []]))} expanded={Boolean(navigationSearch) || index === 1} collapsible={navigation.length > 8 && group !== 'Tổng quan'}>
          {matching.map(({ to, label: itemLabel, icon: Icon, end, match }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive || match?.some(path => location.pathname === path || location.pathname.startsWith(path + '/')) ? 'active' : undefined}>
              <Icon size={17} />
              <span>{itemLabel}</span>
              {actionCountForPath(activity.entries, [to,...match ?? []]) > 0 && <b className="navigation-work-count" aria-hidden="true" title="Hồ sơ cần thực hiện">{actionCountForPath(activity.entries, [to,...match ?? []])}</b>}
            </NavLink>
          ))}
        </NavigationGroup>;
      })}
      {navigationSearch && !navigation.some(item => normalizeNavigation(item.label).includes(normalizeNavigation(navigationSearch.trim()))) && <p className="workspace-nav-empty">Không có mục phù hợp. Đổi từ khóa để tìm lại.</p>}
    </nav>
  );
  const account = (
    <div className="manager-account">
      <button type="button" className="portal-account-avatar" aria-label="Tài khoản cá nhân" onClick={() => { mobile.current?.close(); accountDialog.current?.showModal(); }}>{user?.fullName.slice(0, 1)}</button>
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
    <div className="manager-shell portal-enhanced internal-web">
      <a className="internal-skip" href="#portal-main">Đến nội dung chính</a>
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
            {parent && <>
              <Link className="portal-topbar-parent" to={parent.to}>{parent.label}</Link>
              <span className="portal-topbar-parent-divider" aria-hidden="true">/</span>
            </>}
            <strong aria-current="page">{location.pathname.endsWith('/notifications') ? 'Thông báo & việc cần làm' : active?.label ?? "Hồ sơ chi tiết"}</strong>
          </div>
          <div className="portal-topbar-actions">
            <ActivityBell />
            <span className="portal-role">{roleLabel(user?.role)}</span>
          </div>
        </header>
        <main className="manager-main" id="portal-main" tabIndex={-1}>
          <ActivityRefreshNote />
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
      <dialog ref={accountDialog} className="portal-dialog" aria-label="Tài khoản cá nhân">
        <header><h2>Tài khoản cá nhân</h2><button type="button" className="icon-button" aria-label="Đóng tài khoản" onClick={() => accountDialog.current?.close()}><X size={18} /></button></header>
        <dl className="manager-facts"><div><dt>Họ tên</dt><dd>{user?.fullName}</dd></div><div><dt>Email</dt><dd>{user?.email}</dd></div><div><dt>Vai trò</dt><dd>{roleLabel(user?.role)}</dd></div></dl>
        <button type="button" className="button-secondary" onClick={signOut}><LogOut size={18} />Đăng xuất</button>
      </dialog>
    </div>
  );
}
