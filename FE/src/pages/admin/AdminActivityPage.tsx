import { Link } from "react-router-dom";
import { PageHeader } from "../../components/manager/PortalUi";

export function AdminActivityPage() {
  return (
    <section>
      <PageHeader
        title="Nhật ký hoạt động"
        description="Theo dõi thao tác quản trị và hoạt động hệ thống."
      />
      <section className="manager-section">
        <h2>Chưa có nguồn nhật ký hệ thống</h2>
        <p>
          Hệ thống hiện chưa cung cấp nhật ký kiểm toán để xem người thực hiện,
          thời điểm, hành động và dữ liệu thay đổi. Chức năng này chưa hoàn tất.
        </p>
        <p>
          Các hồ sơ nghiệp vụ vẫn có thông tin xử lý riêng, nhưng chưa đủ để
          thay thế nhật ký hoạt động toàn hệ thống.
        </p>
        <div className="portal-actions">
          <Link className="button-secondary" to="/admin/assignments">
            Xem hồ sơ phân công
          </Link>
          <Link
            className="button-secondary"
            to="/admin/facility/operations/returns"
          >
            Xem hồ sơ kiểm tra trả kho
          </Link>
        </div>
      </section>
    </section>
  );
}
