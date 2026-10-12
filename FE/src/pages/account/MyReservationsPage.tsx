import { Navigate } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { portalDestination } from "../../auth/portal-routing";

export function MyReservationsPage() {
  const { user, loading } = useAuth();
  if (loading) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (!user)
    return (
      <Navigate
        to="/account/login?returnTo=%2Fcustomer%2Freservations"
        replace
      />
    );
  return (
    <Navigate
      to={
        user.role === "CUSTOMER"
          ? "/customer/reservations"
          : portalDestination(user.role)
      }
      replace
    />
  );
}
