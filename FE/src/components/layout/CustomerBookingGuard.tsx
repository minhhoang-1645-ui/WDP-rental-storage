import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { portalDestination } from "../../auth/portal-routing";

export function CustomerBookingGuard() {
  const { user, loading } = useAuth();
  if (loading) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (user && user.role !== "CUSTOMER")
    return <Navigate to={portalDestination(user.role)} replace />;
  return <Outlet />;
}
