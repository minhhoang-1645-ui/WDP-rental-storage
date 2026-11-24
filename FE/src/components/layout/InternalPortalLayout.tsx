import { roleNamespace } from '../../role-names';
import '../../styles/internal-web.css';
import { listMemoryKey, useInternalListReturn } from '../workspace/internal-list-memory';
import { safeLocalStorage, safeSessionStorage } from '../../services/browser-storage';
import { useWorkspaceTheme } from '../../hooks/useWorkspaceTheme';
import { WorkspaceProfileDropdown } from '../workspace/WorkspaceProfileDropdown';
import { startTransition, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Warehouse,
  X,
  type LucideIcon,
} from "lucide-react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { label as roleLabel } from "../manager/portal-data";
import { NavigationGroup } from '../workspace/NavigationGroup';
import { ActivityBell } from '../../activity/ActivityCenter';
import { workspaceInboxPath } from '../../activity/workspace-notifications';
import { useActivity } from '../../activity/context';
import { actionCountForPath } from '../../utils/notification-tools';
import { staffWorkItems } from '../../pages/staff/staff-work';
import { isEarlyReturnRequest } from '../../utils/early-return';
import { isCustomerTransferSubject } from '../../utils/transfer-request';
import { hasLinkedTransfer } from '../../utils/work-queue';
const matchesPath = (pathname: string, path: string) => pathname === path || pathname.startsWith(path + '/');
const matchesAlias = (item: InternalNavItem, pathname: string) =>
  Boolean(item.match?.some(path => item.end ? pathname === path : matchesPath(pathname, path)));
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
  scopeControl,
  outletContext,
  scopeReady = true,
  scopeNotice,
}: {
  label: string;
  navigation: InternalNavItem[];
  // Extra route names are used in the breadcrumb only, never added to either menu.
  pageNavigation?: Pick<InternalNavItem, "to" | "label" | "end">[];
  themed?: boolean;
  scopeControl?: ReactNode;
  outletContext?: unknown;
  scopeReady?: boolean;
  scopeNotice?: ReactNode;
}) {
  const { user, logout } = useAuth();
  const activity = useActivity();
  const location = useLocation();
  const notificationInbox = user ? workspaceInboxPath(user.role) : undefined;
  const notificationBack = useInternalListReturn(notificationInbox ?? '');
  const navigate = useNavigate();
  const { theme, toggleTheme } = useWorkspaceTheme(themed);
  const profileMenu = themed && user && ['FACILITY_STAFF', 'FACILITY_MANAGER', 'BUSINESS_OPERATIONS_MANAGER', 'SYSTEM_ADMINISTRATOR'].includes(user.role) ? user : null;
  const sidebarKey = user?.role === 'SYSTEM_ADMINISTRATOR' ? 'nestbox-admin-sidebar' : user?.role === 'FACILITY_MANAGER' ? 'nestbox-manager-sidebar' : 'nestbox-staff-sidebar';
  const [collapsed, setCollapsed] = useState(() => themed && safeLocalStorage.getItem(sidebarKey) === 'collapsed');
  function toggleSidebar() {
    safeLocalStorage.setItem(sidebarKey, collapsed ? 'expanded' : 'collapsed');
    setCollapsed(!collapsed);
  }
  useEffect(() => { if (user) safeSessionStorage.setItem(listMemoryKey(user.id, location.pathname), location.pathname + location.search); }, [user, location.pathname, location.search]);
  const signOut = () => {
    startTransition(() => {
      logout();
      navigate('/account/login', { replace: true });
    });
  };
  const mobile = useRef<HTMLDialogElement>(null);
  const settingsPath = `/${roleNamespace(user?.role ?? '')}/settings`;
  const openSettings = (section: 'profile' | 'security' | 'appearance') => {
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
  const parent = navigation.find(item => item.to !== active?.to && matchesAlias(item, location.pathname));
  const staff = user?.role === 'FACILITY_STAFF';
  const staffSection = staff ? active ?? parent : undefined;
  const isStaffDetail = staffSection && staffSection.to !== '/staff' && (
    [staffSection.to, ...(parent?.match ?? [])].some(path => location.pathname.startsWith(path + '/'))
    || staffSection.to === '/staff/damage-claims' && new URLSearchParams(location.search).has('claim')
  );
  const crumb = location.pathname.endsWith('/notifications') ? 'Thông báo'
    : matchesPath(location.pathname, settingsPath) ? 'Cài đặt tài khoản'
    : staff && location.pathname === '/staff/overstays' ? 'Kho quá hạn chưa trả'
    : isStaffDetail ? 'Chi tiết'
    : staffSection?.label ?? active?.label ?? 'Hồ sơ chi tiết';
  const crumbParent = staff ? isStaffDetail ? staffSection : undefined : parent;
  const brand: ReactNode = (
    <Link
      className="portal-brand"
      aria-label={themed ? `NestBox Storage · ${user?.role === 'FACILITY_STAFF' ? 'Bàn làm việc' : 'Tổng quan'}` : undefined}
      to={
        user?.role === "SYSTEM_ADMINISTRATOR"
          ? "/admin"
          : user?.role === "FACILITY_STAFF"
            ? "/staff"
            : user?.role === 'BUSINESS_OPERATIONS_MANAGER' ? '/operations' : "/manager"
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
  const personalTasks = staff ? staffWorkItems(activity, user?.id) : [];
  const navigationActivity = staff ? personalTasks.map(task => task.entry) : activity.entries;
  const personalTaskCount = personalTasks.length;
  const managerReviewCount = user?.role === 'FACILITY_MANAGER' ? Object.entries(activity.data).reduce((sum,[kind,records]) => sum + records.filter(row => {
    const status = String(row.status);
    if (kind === 'support-requests') return isEarlyReturnRequest(row) ? !row.decision && !row.earlyReturnDecision && ['OPEN','ESCALATED'].includes(status) : isCustomerTransferSubject(row.subject) ? status !== 'RESOLVED' && !hasLinkedTransfer(row) : status === 'ESCALATED' && !hasLinkedTransfer(row);
    if (kind === 'damage-claims') return status === 'INVESTIGATING' && Boolean(row.staffFacts);
    return (kind === 'maintenance' && status === 'AWAITING_VERIFICATION') || (kind === 'transfers' && status === 'REQUESTED') || (kind === 'renewals' && status === 'PENDING') || (kind === 'deposit-settlements' && status === 'PENDING_REVIEW') || (kind === 'payment-submissions' && status === 'PENDING_VERIFICATION') || (kind === 'online-payment-reconciliations' && ['PENDING_REVIEW','REFUND_REQUIRED'].includes(status));
  }).length,0) : 0;
  const countFor = (item: InternalNavItem) => {
    if (item.end) return 0;
    if (staff && item.to === '/staff/tasks') return personalTaskCount;
    if (item.to === '/manager/reviews') return managerReviewCount;
    return actionCountForPath(navigationActivity, [item.to, ...(item.match ?? [])]);
  };
  const nav = (iconOnly = false) => (
    <nav aria-label={`Điều hướng ${label}`}>
      {groups.map(({ group, items }, index) => {
        const active = items.some(item => (item.end ? location.pathname === item.to : matchesPath(location.pathname, item.to))
          || matchesAlias(item, location.pathname));
        const count = staff || user?.role === 'FACILITY_MANAGER' && group === 'Quản lý' ? 0
          : actionCountForPath(activity.entries, items.flatMap(item => [item.to, ...(item.match ?? [])]));
        return <NavigationGroup key={group} title={group} active={active} count={count} expanded={themed ? index <= 2 : index === 1} collapsible={!iconOnly && navigation.length > 8 && group !== 'Tổng quan'}>
          {items.map(item => {
            const { to, label: itemLabel, icon: Icon, end } = item;
            const aliasActive = matchesAlias(item, location.pathname);
            const count = countFor(item);
            return <NavLink key={to} to={to} end={end} title={iconOnly ? itemLabel : undefined}
              aria-label={iconOnly ? itemLabel : undefined}
              className={({ isActive }) => isActive || aliasActive ? 'active' : undefined}>
              <Icon size={17} aria-hidden="true" />
              <span>{itemLabel}</span>
              {count > 0 && <b className="navigation-work-count" aria-hidden="true" title="Hồ sơ cần thực hiện">{staff && count > 99 ? '99+' : count}</b>}
            </NavLink>;
          })}
        </NavigationGroup>;
      })}
    </nav>
  );
  const account = (
    <div className="manager-account">
      <span className="portal-account-avatar" aria-hidden="true">{user?.fullName.slice(0, 1)}</span>
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
    <div className={`manager-shell portal-enhanced internal-web${themed ? ' workspace-themed' : ''}${collapsed ? ' is-sidebar-collapsed' : ''}`} data-workspace-theme={themed ? theme : undefined} data-workspace-role={themed ? roleNamespace(user?.role ?? '') : undefined}>
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
            <nav className="portal-breadcrumb" aria-label="Đường dẫn">
              <span className="portal-breadcrumb-root">{label}</span>
              <span className="portal-topbar-divider" aria-hidden="true">/</span>
              {crumbParent && <>
                <Link className="portal-topbar-parent" to={crumbParent.to}>{crumbParent.label}</Link>
                <span className="portal-topbar-parent-divider" aria-hidden="true">/</span>
              </>}
              <strong aria-current="page">{crumb}</strong>
            </nav>
          </div>
          <div className="portal-topbar-actions">
            {scopeControl}
            <ActivityBell />
            {profileMenu ? <WorkspaceProfileDropdown key={location.pathname} user={profileMenu}
              roleLabel={roleLabel(profileMenu.role)} theme={theme} onToggleTheme={toggleTheme}
              onProfile={() => openSettings('profile')} onSecurity={() => openSettings('security')} onAppearance={() => openSettings('appearance')} onLogout={signOut} />
              : <span className="portal-role">{roleLabel(user?.role)}</span>}
          </div>
        </header>
        <main className="manager-main" id="portal-main" tabIndex={-1}>
          {notificationInbox && location.state?.notificationInbox === notificationInbox && location.pathname !== notificationInbox &&
            <Link to={notificationBack} className="workspace-notification-back"><ArrowLeft size={15} aria-hidden="true" />Về thông báo</Link>}
          {scopeReady ? <Outlet context={outletContext} /> : scopeNotice}
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
