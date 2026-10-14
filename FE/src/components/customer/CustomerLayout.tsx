import {
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
import { startTransition, useEffect, useRef, useState } from "react";
import {
  NavLink,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { portalDestination } from "../../auth/portal-routing";

const navigation = [
  { to: "/customer", label: "Tổng quan", icon: LayoutDashboard, end: true },
  {
    to: "/customer/reservations",
    label: "Yêu cầu đặt kho",
    icon: ClipboardList,
  },
  { to: "/customer/rentals", label: "Kho đang thuê", icon: Warehouse },
  { to: "/customer/contracts", label: "Hợp đồng", icon: FileText },
  { to: "/customer/payments", label: "Thanh toán", icon: CreditCard },
  { to: "/customer/appointments", label: "Lịch hẹn", icon: CalendarClock },
  { to: "/customer/renewals", label: "Gia hạn", icon: Repeat2 },
  { to: "/customer/returns", label: "Trả kho & tiền cọc", icon: RotateCcw },
  { to: "/customer/transfers", label: "Chuyển đổi kho", icon: ArrowRightLeft },
  { to: "/customer/support", label: "Hỗ trợ", icon: CircleHelp },
] as const;

export function CustomerLayout() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
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

  return (
    <div className="customer-shell">
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
            aria-label="WDP Storage - Khu vực khách hàng"
          >
            <span>WDP</span>
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
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={"end" in item && item.end}
                onClick={() => setMenuOpen(false)}
                className="customer-nav-link"
              >
                <Icon size={18} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="customer-sidebar-bottom">
          <NavLink to="/customer/profile" className="customer-account">
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
          <span>WDP Storage</span>
          <NavLink to="/customer/profile" aria-label="Hồ sơ">
            <UserRound size={20} />
          </NavLink>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
