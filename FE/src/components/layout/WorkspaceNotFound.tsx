import { Link } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { portalDestination } from "../../auth/portal-routing";

export function WorkspaceNotFound() {
  const { user } = useAuth();
  return (
    <section className="manager-empty">
      <h1>Không tìm thấy trang</h1>
      <p>Đường dẫn này không có trong khu vực của bạn.</p>
      <Link
        className="button-primary"
        to={user ? portalDestination(user.role) : "/portal/login"}
      >
        Về tổng quan
      </Link>
    </section>
  );
}
