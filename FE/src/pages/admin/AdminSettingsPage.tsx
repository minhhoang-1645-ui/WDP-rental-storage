import { RefreshCw } from "lucide-react";
import { OperationsLink as Link } from "../../components/manager/OperationsLink";
import { useAuth } from "../../auth/auth-context";
import { useApiResource } from "../../services/useApiResource";
import {
  date,
  first,
  label,
  type Row,
} from "../../components/manager/portal-data";
import {
  Facts,
  LoadState,
  PageHeader,
} from "../../components/manager/PortalUi";
export function AdminSettingsPage() {
  const { user } = useAuth();
  const health = useApiResource<Row>("/health", user?.id ?? "");
  return (
    <section>
      <PageHeader
        title="Cấu hình cơ sở"
        description="Xem thông tin hệ thống và cấu hình cơ sở hiện có."
      >
        <button
          className="button-secondary"
          disabled={health.loading}
          onClick={health.refresh}
        >
          <RefreshCw size={16} />
          Kiểm tra kết nối
        </button>
      </PageHeader>
      <LoadState
        loading={health.loading}
        error={health.error}
        retry={health.refresh}
      />
      <div className="portal-overview-grid">
        <section className="manager-section">
          <h2>Kết nối dịch vụ</h2>
          <Facts
            items={[
              [
                "Dịch vụ",
                health.data ? first(health.data, "service") : "Đang kiểm tra",
              ],
              [
                "Trạng thái",
                health.data?.status === "ok"
                  ? "Đã kết nối"
                  : health.loading
                    ? "Đang kiểm tra"
                    : "Chưa kết nối",
              ],
              ["Lần kiểm tra", date(health.data?.timestamp, true)],
              ["Múi giờ hiển thị", "UTC+07 · Asia/Bangkok"],
            ]}
          />
        </section>
        <section className="manager-section">
          <h2>Phiên quản trị</h2>
          <Facts
            items={[
              ["Họ tên", user?.fullName],
              ["Email", user?.email],
              ["Vai trò", label(user?.role)],
            ]}
          />
          <Link className="button-secondary" to="/admin/users">
            Quản lý tài khoản
          </Link>
        </section>
      </div>
      <section className="manager-section">
        <h2>Cấu hình nghiệp vụ</h2>
        <p>
          Chưa hỗ trợ chỉnh sửa và lưu cấu hình cơ sở. Danh mục kho và bảng giá
          hiện chỉ có thể xem.
        </p>
        <div className="portal-actions">
          <Link className="button-secondary" to="/manager/catalog">
            Xem loại kho & bảng giá
          </Link>
          <Link className="button-secondary" to="/manager/reports">
            Xem báo cáo vận hành
          </Link>
        </div>
      </section>
    </section>
  );
}
