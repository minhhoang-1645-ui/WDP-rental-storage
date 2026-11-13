import '../../styles/internal-web.css';
import { listMemoryKey } from '../workspace/internal-list-memory';
import { safeLocalStorage, safeSessionStorage } from '../../services/browser-storage';
import { useWorkspaceTheme } from '../../hooks/useWorkspaceTheme';
import { WorkspaceProfileDropdown } from '../workspace/WorkspaceProfileDropdown';
import { startTransition, useEffect, useRef, useState, type ReactNode } from "react";
import {
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  UserRound,
  Warehouse,
  X,
  type LucideIcon,
} from "lucide-react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { label as roleLabel } from "../manager/portal-data";
import { NavigationGroup } from '../workspace/NavigationGroup';
import { ActivityBell } from '../../activity/ActivityCenter';
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
  themed = false,
}: {
  label: string;
  navigation: InternalNavItem[];
  // Extra route names are used in the breadcrumb only, never added to either menu.
  pageNavigation?: Pick<InternalNavItem, "to" | "label" | "end">[];
  themed?: boolean;
}) {
  const { user, logout } = useAuth();
  const activity = useActivity();
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useWorkspaceTheme(themed);
  const profileMenu = themed && user && ['STAFF', 'MANAGER', 'ADMIN'].includes(user.role) ? user : null;
  const sidebarKey = user?.role === 'ADMIN' ? 'nestbox-admin-sidebar' : user?.role === 'MANAGER' ? 'nestbox-manager-sidebar' : 'nestbox-staff-sidebar';
  const [collapsed, setCollapsed] = useState(() => themed && safeLocalStorage.getItem(sidebarKey) === 'collapsed');
  function toggleSidebar() {
    safeLocalStorage.setItem(sidebarKey, collapsed ? 'expanded' : 'collapsed');
    setCollapsed(!collapsed);
  }
  useEffect(() => { if (user) safeSessionStorage.setItem(listMemoryKey(user.id, location.pathname), location.pathname + location.search); }, [user, location.pathname, location.search]);
  const [navigationFilter, setNavigationFilter] = useState({ path: location.pathname, value: '' });
  const navigationSearch = navigationFilter.path === location.pathname ? navigationFilter.value : '';
  const signOut = () => {
    startTransition(() => {
      logout();
      navigate(profileMenu ? "/portal/login" : "/account/login", { replace: true });
    });
  };
  const mobile = useRef<HTMLDialogElement>(null);
  const settingsPath = `/${user?.role.toLowerCase()}/settings`;
  const openSettings = (section: 'profile' | 'appearance') => {
    mobile.current?.close();
    navigate(`${settingsPath}/${section}`);
  };
  const groups: Array<{ group: string; items: InternalNavItem[] }> = [];
  for (const item of navigation) {
    const group = item.group ?? "Điều hướng";
    const found = groups.find((g) => g.group === group);
    if (found) found.items.push(item);
    else groups.push({ group, items: [item] });
  }
  if (themed && !groups.some(item => item.group === 'Tài khoản')) groups.push({ group: 'Tài khoản', items: [] });
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
      aria-label={themed ? `NestBox Storage · ${user?.role === 'STAFF' ? 'Bàn làm việc' : 'Tổng quan'}` : undefined}
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
  const nav = (iconOnly = false) => (
    <nav aria-label={`Điều hướng ${label}`}>
      {!iconOnly && navigation.length > 8 && <label className="workspace-nav-search"><span>{themed ? 'Tìm trong menu' : 'Tìm chức năng'}</span><input type="search" value={navigationSearch} onChange={event => setNavigationFilter({ path: location.pathname, value: event.target.value })} placeholder={themed ? user?.role === 'MANAGER' ? 'Phân công, hóa đơn…' : 'Đặt kho, bàn giao…' : 'Đặt kho, bàn giao, hóa đơn…'} /></label>}
      {groups.map(({ group, items }, index) => {
        const matching = iconOnly ? items : items.filter(item => normalizeNavigation(item.label).includes(normalizeNavigation(navigationSearch.trim())));
        const showProfile = themed && group === 'Tài khoản' && (!navigationSearch || iconOnly);
        if (!matching.length && !showProfile) return null;
        const active = items.some(item => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)) || item.match?.some(path => location.pathname === path || location.pathname.startsWith(path + '/')));
        return <NavigationGroup key={`${group}:${Boolean(navigationSearch)}:`} title={group} active={active} count={actionCountForPath(activity.entries, items.flatMap(item => [item.to,...item.match ?? []]))} expanded={Boolean(navigationSearch) || (themed ? index <= 2 : index === 1)} collapsible={!iconOnly && navigation.length > 8 && group !== 'Tổng quan'}>
          {matching.map(({ to, label: itemLabel, icon: Icon, end, match }) => (
            <NavLink key={to} to={to} end={end} title={iconOnly ? itemLabel : undefined} aria-label={iconOnly ? itemLabel : undefined} className={({ isActive }) => isActive || match?.some(path => matchesPath(location.pathname, path)) ? 'active' : undefined}>
              <Icon size={17} />
              <span>{itemLabel}</span>
              {actionCountForPath(activity.entries, [to,...match ?? []]) > 0 && <b className="navigation-work-count" aria-hidden="true" title="Hồ sơ cần thực hiện">{actionCountForPath(activity.entries, [to,...match ?? []])}</b>}
            </NavLink>
          ))}
          {showProfile && <button type="button" className="workspace-profile-link" title={iconOnly ? 'Hồ sơ cá nhân' : undefined} aria-label="Hồ sơ cá nhân" onClick={() => openSettings('profile')}><UserRound size={17} /><span>Hồ sơ cá nhân</span></button>}
        </NavigationGroup>;
      })}
      {!iconOnly && navigationSearch && !navigation.some(item => normalizeNavigation(item.label).includes(normalizeNavigation(navigationSearch.trim()))) && <p className="workspace-nav-empty">Không có mục phù hợp. Đổi từ khóa để tìm lại.</p>}
    </nav>
  );
  const account = (
    <div className="manager-account">
      <button type="button" className="portal-account-avatar" aria-label="Tài khoản cá nhân" onClick={() => openSettings('profile')}>{user?.fullName.slice(0, 1)}</button>
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
    <div className={`manager-shell portal-enhanced internal-web${themed ? ' workspace-themed' : ''}${collapsed ? ' is-sidebar-collapsed' : ''}`} data-workspace-theme={themed ? theme : undefined} data-workspace-role={themed ? user?.role.toLowerCase() : undefined}>
      <a className="internal-skip" href="#portal-main">Đến nội dung chính</a>
      <aside className="manager-sidebar">
        {brand}
        {nav(collapsed)}
        {account}
      </aside>
      <div className="portal-workspace">
        <header className="portal-topbar">
          <div>
            {themed && <button type="button" className="icon-button workspace-sidebar-toggle" aria-label={collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'} aria-expanded={!collapsed} onClick={toggleSidebar}>{collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}</button>}
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
            <strong aria-current="page">{location.pathname.endsWith('/notifications') ? 'Thông báo & việc cần làm' : matchesPath(location.pathname, settingsPath) ? "Cài đặt tài khoản" : active?.label ?? "Hồ sơ chi tiết"}</strong>
          </div>
          <div className="portal-topbar-actions">
            <ActivityBell />
            {profileMenu ? <WorkspaceProfileDropdown key={location.pathname} user={profileMenu}
              roleLabel={roleLabel(profileMenu.role)} theme={theme} onToggleTheme={toggleTheme}
              onProfile={() => openSettings('profile')} onAppearance={() => openSettings('appearance')} onLogout={signOut} />
              : <span className="portal-role">{roleLabel(user?.role)}</span>}
          </div>
        </header>
        <main className="manager-main" id="portal-main" tabIndex={-1}>
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
        {nav()}
        {account}
      </dialog>
    </div>
  );
}
