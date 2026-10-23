import { ArrowRight, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { WorkHub } from '../../components/workspace/WorkHub';
import { allPages } from "../../services/portal";
import { first, label, type Page } from "../../components/manager/portal-data";
import {
  LoadState,
  PageHeader,
  Status,
} from "../../components/manager/PortalUi";
export function AdminDashboardPage() {
  const { user } = useAuth();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    key: string;
    data?: Page;
    error?: string;
  }>();
  const key = `${user?.id}:${revision}`;
  useEffect(() => {
    const controller = new AbortController();
    allPages("/admin/users", controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ key, data });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({
            key,
            error:
              error instanceof Error
                ? error.message
                : "Không thể tải thống kê.",
          });
      });
    return () => controller.abort();
  }, [key]);
  const current = state?.key === key ? state : undefined;
  return (
    <section>
      <PageHeader
        title="Tổng quan quản trị"
        description={`Xin chào ${user?.fullName ?? ""}. Quản lý tài khoản và quyền truy cập hệ thống.`}
      >
        <button
          className="button-secondary"
          disabled={!current}
          onClick={() => setRevision((v) => v + 1)}
        >
          <RefreshCw size={16} />
          Làm mới
        </button>
      </PageHeader>
      <WorkHub title="Quản lý truy cập" description="Tìm tài khoản, cấp nhân viên/Quản lý và kiểm tra trạng thái truy cập trong cùng một nơi." actions={[
        { title: 'Quản lý tài khoản', description: 'Tìm tên hoặc email; xem hồ sơ, tạo tài khoản nội bộ và bật/tắt truy cập.', to: '/admin/users', icon: Users },
        { title: 'Tra cứu nhân viên kho', description: 'Tìm nhân viên đang hoạt động, lấy mã tài khoản để quản lý phân công.', to: '/admin/users?role=STAFF', icon: ShieldCheck },
      ]} />
      <LoadState
        loading={!current}
        error={current?.error ?? ""}
        retry={() => setRevision((v) => v + 1)}
      />
      {current?.data && (
        <>
          <div className="portal-metrics">
            {["CUSTOMER", "STAFF", "MANAGER", "ADMIN"].map((role) => (
              <Link
                className="portal-metric"
                key={role}
                to={`/admin/users?role=${role}`}
              >
                <span>{label(role)}</span>
                <strong>
                  {
                    current.data!.items.filter((row) => row.role === role)
                      .length
                  }
                </strong>
                <small>
                  {
                    current.data!.items.filter(
                      (row) =>
                        row.role === role && row.accountStatus === "ACTIVE",
                    ).length
                  }{" "}
                  đang hoạt động
                </small>
              </Link>
            ))}
          </div>
          <section className="manager-section">
            <h2>
              <Users size={20} /> Quản lý tài khoản
            </h2>
            <p>
              Cấp tài khoản nhân viên, quản lý; xem thông tin và bật/tắt quyền
              truy cập.
            </p>
            <div className="portal-actions">
              <Link className="button-primary" to="/admin/users">
                Mở danh sách <ArrowRight size={16} />
              </Link>
              <Link
                className="button-secondary"
                to="/admin/users?status=DISABLED"
              >
                Tài khoản vô hiệu hóa
              </Link>
            </div>
          </section>
          <section className="manager-section">
            <h2>
              <ShieldCheck size={20} /> Tài khoản nội bộ
            </h2>
            <div className="manager-table-wrap">
              <table className="manager-table">
                <thead>
                  <tr>
                    <th>Họ tên</th>
                    <th>Email</th>
                    <th>Vai trò</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {current.data.items
                    .filter((row) => row.role !== "CUSTOMER")
                    .slice(0, 8)
                    .map((row) => (
                      <tr key={first(row, "id")}>
                        <td>
                          <strong>{first(row, "fullName")}</strong>
                        </td>
                        <td>{first(row, "email")}</td>
                        <td>
                          <Status value={row.role} />
                        </td>
                        <td>
                          <Status value={row.accountStatus} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <Link className="portal-record-link" to="/admin/users">
              Xem toàn bộ tài khoản →
            </Link>
          </section>
        </>
      )}
    </section>
  );
}
