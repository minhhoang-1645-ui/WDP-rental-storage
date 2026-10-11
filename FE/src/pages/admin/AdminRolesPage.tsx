import { Link } from "react-router-dom";
import { PageHeader } from "../../components/manager/PortalUi";

// These groups reflect the existing controller guards, not editable role definitions.
const permissions = [
  ["Tạo tài khoản nội bộ, quản lý trạng thái", "Có", "Không", "Không"],
  ["Xem và xử lý yêu cầu đặt kho, tư vấn", "Có", "Có", "Không"],
  ["Phân công hỗ trợ và bảo trì", "Có", "Có", "Không"],
  ["Duyệt gia hạn, chuyển kho, quyết toán cọc", "Có", "Có", "Không"],
  ["Xác nhận lịch bàn giao", "Có", "Có", "Không"],
  ["Hoàn tất bàn giao và kiểm tra trả kho", "Có", "Có", "Có"],
  [
    "Bắt đầu sửa chữa, gửi kết quả sửa chữa",
    "Không",
    "Không",
    "Nhân viên được giao",
  ],
  ["Xử lý hỗ trợ thông thường", "Không", "Không", "Nhân viên được giao"],
];

export function AdminRolesPage() {
  return (
    <section>
      <PageHeader
        title="Vai trò và quyền truy cập"
        description="Các nhóm quyền hiện đang được hệ thống áp dụng cho tài khoản nội bộ."
      />
      <div className="booking-alert">
        Chỉ hỗ trợ xem quyền hiện tại. Chưa hỗ trợ thay đổi vai trò tài khoản
        hoặc tạo, sửa nhóm quyền.
      </div>
      <section className="manager-section">
        <h2>Quyền theo nhóm nghiệp vụ</h2>
        <p>
          Quyền truy cập còn phụ thuộc trạng thái hồ sơ và nhân viên được phân
          công.
        </p>
        <div className="manager-table-wrap">
          <table className="manager-table">
            <thead>
              <tr>
                <th>Nghiệp vụ</th>
                <th>Quản trị viên</th>
                <th>Quản lý</th>
                <th>Nhân viên</th>
              </tr>
            </thead>
            <tbody>
              {permissions.map(([action, admin, manager, staff]) => (
                <tr key={action}>
                  <td>{action}</td>
                  <td>{admin}</td>
                  <td>{manager}</td>
                  <td>{staff}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="manager-section">
        <h2>Vai trò của tài khoản</h2>
        <p>
          Tài khoản khách hàng được đăng ký qua khu vực khách hàng. Quản trị
          viên có thể cấp tài khoản nhân viên hoặc quản lý; không thể cấp tài
          khoản quản trị viên qua giao diện hiện tại.
        </p>
        <Link className="button-secondary" to="/admin/users">
          Xem vai trò tài khoản
        </Link>
      </section>
    </section>
  );
}
