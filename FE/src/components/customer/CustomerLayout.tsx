import {
  Bell,
  History,
  ArrowRightLeft,
  CalendarClock,
  CircleHelp,
  ClipboardList,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Repeat2,
  RotateCcw,
  UserRound,
  Warehouse,
  X,
} from "lucide-react";
import { safeSessionStorage } from '../../services/browser-storage';
import { listMemoryKey } from '../workspace/internal-list-memory';
import { NavigationGroup } from "../workspace/NavigationGroup";
import { startTransition, useEffect, useRef, useState } from "react";
import {
  NavLink,
  Link,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { portalDestination } from "../../auth/portal-routing";
import type { WorkspaceSection } from '../workspace/WorkspaceSectionPage';
import { useWorkspaceTheme } from '../../hooks/useWorkspaceTheme';
import { WorkspaceProfileDropdown } from '../workspace/WorkspaceProfileDropdown';
import { ActivityBell } from '../../activity/ActivityCenter';
import { useActivity } from '../../activity/context';
import { actionCountForPath } from '../../utils/notification-tools';

const navigation = [
  { to: '/customer/damage-claims', label: 'Sự cố hàng hóa', icon: CircleHelp },
  { to: "/customer", label: "Tổng quan", icon: LayoutDashboard, end: true },
  {
    to: "/customer/reservations",
    label: "Đơn đặt kho",
    icon: ClipboardList,
  },
  { to: "/customer/booking-history", label: "Lịch sử đặt kho", icon: History },
  { to: "/customer/rentals", label: "Kho của tôi", icon: Warehouse },
  { to: '/customer/stock-movements', label: 'Nhập – xuất hàng', icon: ArrowRightLeft },
  { to: '/customer/stored-items', label: 'Hàng đang lưu', icon: ClipboardList },
  { to: "/customer/contracts", label: "Hợp đồng", icon: FileText },
  { to: "/customer/payments", label: "Hóa đơn & thanh toán", icon: CreditCard },
  { to: "/customer/appointments", label: "Lịch bàn giao", icon: CalendarClock },
  { to: "/customer/renewals", label: "Gia hạn", icon: Repeat2 },
  { to: "/customer/returns", label: "Trả kho & tiền cọc", icon: RotateCcw },
  { to: "/customer/transfers", label: "Chuyển đổi kho", icon: ArrowRightLeft },
  { to: "/customer/support", label: "Hỗ trợ", icon: CircleHelp },
] as const;
const customerGroups = [
  { key: 'booking', icon: ClipboardList, title: 'Đặt kho & nhận kho', paths: ['/customer/reservations', '/customer/payments', '/customer/appointments', '/customer/contracts'] },
  { key: 'storage', icon: Warehouse, title: 'Kho & hàng của tôi', paths: ['/customer/rentals', '/customer/booking-history', '/customer/stock-movements', '/customer/stored-items'] },
  { key: 'support', icon: CircleHelp, title: 'Thay đổi & hỗ trợ', paths: ['/customer/renewals', '/customer/returns', '/customer/transfers', '/customer/support', '/customer/damage-claims'] },
];

export const customerSections: WorkspaceSection[] = customerGroups.map(group => ({
  ...group,
  items: group.paths.map(path => navigation.find(item => item.to === path)!),
}));

export function CustomerLayout() {
  const { user, loading, logout } = useAuth();
  const activity = useActivity();
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useWorkspaceTheme(true);
  useEffect(() => { if (user) safeSessionStorage.setItem(listMemoryKey(user.id, location.pathname), location.pathname + location.search); }, [user, location.pathname, location.search]);
  const [menuOpen, setMenuOpen] = useState(false);
  const sidebar = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const opener = menuButton.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      [
        ...(sidebar.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex="0"]',
        ) ?? []),
      ].filter((element) => element.getClientRects().length > 0);
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements.at(-1);
      if (!first || !last) return;
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !sidebar.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !sidebar.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    const onResize = () => {
      if (window.matchMedia("(min-width: 761px)").matches) setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [menuOpen]);

  if (loading)
    return (
      <main className="customer-shell-loading" role="status">
        Đang kiểm tra phiên đăng nhập…
      </main>
    );
  if (!user)
    return (
      <Navigate
        to={`/account/login?returnTo=${encodeURIComponent(location.pathname + location.search + location.hash)}`}
        replace
      />
    );
  if (user.role !== "CUSTOMER")
    return <Navigate to={portalDestination(user.role)} replace />;

  const signOut = () => {
    startTransition(() => {
      logout();
      navigate("/account/login", { replace: true });
    });
  };

  const settings = location.pathname.startsWith('/customer/settings') || location.pathname === '/customer/profile';
  return (
    <div className={settings ? 'customer-shell workspace-themed customer-settings-shell' : 'customer-shell'}
      data-workspace-theme={settings ? theme : undefined}>
      <aside
        id="customer-navigation"
        ref={sidebar}
        className={menuOpen ? "customer-sidebar is-open" : "customer-sidebar"}
        aria-label="Điều hướng khu vực khách hàng"
      >
        <div className="customer-sidebar-top">
          <NavLink
            to="/customer"
            className="customer-brand"
            aria-label="NestBox Storage - Khu vực khách hàng"
          >
            <span>NestBox</span>
            <small>Khu vực khách hàng</small>
          </NavLink>
          <button
            className="customer-menu-close"
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label="Đóng menu"
          >
            <X size={20} />
          </button>
        </div>
        <nav className="customer-nav">
          <Link to="/booking" className="customer-booking-shortcut" onClick={() => setMenuOpen(false)}><Warehouse size={18} />Tìm & đặt kho</Link>
          <NavLink to="/customer" end className="customer-nav-link" onClick={() => setMenuOpen(false)}><LayoutDashboard size={18} />Tổng quan</NavLink>
          <NavLink to="/customer/notifications" className="customer-nav-link" onClick={() => setMenuOpen(false)}><Bell size={18} />Thông báo & việc cần làm</NavLink>
          {customerGroups.map(group => {
            const count = actionCountForPath(activity.entries, group.paths);
            const childActive = group.paths.some(path => location.pathname === path || location.pathname.startsWith(path + '/'));
            return <NavigationGroup key={group.key} title={group.title} active={childActive} count={count} expanded={group.key === 'booking'}>
              {group.paths.map(path => { const item = navigation.find(entry => entry.to === path)!; const ItemIcon = item.icon; return <NavLink key={path} to={path} className="customer-nav-link" onClick={() => setMenuOpen(false)}><ItemIcon size={18} /><span>{item.label}</span></NavLink>; })}
            </NavigationGroup>;
          })}
        </nav>
        <div className="customer-sidebar-bottom">
          <NavLink to="/customer/settings/profile" className="customer-account" onClick={() => setMenuOpen(false)}>
            <span className="customer-avatar">
              <UserRound size={18} />
            </span>
            <span>
              <strong>{user.fullName}</strong>
              <small>{user.email}</small>
            </span>
          </NavLink>
          <button type="button" className="customer-logout" onClick={signOut}>
            <LogOut size={17} /> Đăng xuất
          </button>
        </div>
      </aside>
      {menuOpen && (
        <button
          className="customer-overlay"
          type="button"
          aria-label="Đóng menu"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <main className="customer-main">
        <header className="customer-mobile-header">
          <button
            ref={menuButton}
            className="icon-button"
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Mở menu"
            aria-expanded={menuOpen}
            aria-controls="customer-navigation"
          >
            <Menu size={20} />
          </button>
          <span>NestBox Storage</span>
        </header>
        <div className="customer-updates-bar">
          <span>Khu vực khách hàng</span>
          <div className="customer-account-actions">
            <ActivityBell />
            <div className="workspace-themed" data-workspace-theme={theme}>
              <WorkspaceProfileDropdown key={location.pathname} user={user} roleLabel="Khách hàng"
                theme={theme} onToggleTheme={toggleTheme} onProfile={() => navigate('/customer/settings/profile')}
                onAppearance={() => navigate('/customer/settings/appearance')} onLogout={signOut} />
            </div>
          </div>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
