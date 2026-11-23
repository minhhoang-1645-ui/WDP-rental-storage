import { BriefcaseBusiness, ClipboardCheck, ShieldCheck, UserRound } from 'lucide-react';

const adminRoles = {
  STORAGE_CUSTOMER: {
    label: 'Khách hàng', icon: UserRound,
    description: 'Quản lý hồ sơ và dịch vụ lưu trữ của mình.',
    access: ['Đặt kho và theo dõi yêu cầu của mình.', 'Xem hợp đồng, hóa đơn, thanh toán và hàng đang lưu của mình.', 'Gửi yêu cầu nhập/xuất, gia hạn, chuyển kho, trả kho hoặc hỗ trợ.'],
  },
  FACILITY_STAFF: {
    label: 'Nhân viên', icon: ClipboardCheck,
    description: 'Thực hiện nhiệm vụ được giao tại cơ sở được cấp quyền.',
    access: ['Thực hiện bàn giao, chuyển kho và kiểm tra trả kho theo nhiệm vụ được giao.', 'Báo sự cố tại cơ sở được cấp quyền; không bắt buộc kiểm đếm đồ cá nhân của khách khi chuyển hoặc trả kho.', 'Xử lý yêu cầu hỗ trợ và bảo trì được giao.'],
  },
  FACILITY_MANAGER: {
    label: 'Quản lý', icon: BriefcaseBusiness,
    description: 'Điều phối hoạt động tại các cơ sở được cấp quyền.',
    access: ['Phân công nhân viên và theo dõi kho, khách hàng, hợp đồng, kết quả kiểm đếm.', 'Duyệt yêu cầu nhân viên chuyển lên và kết quả bảo trì.', 'Kiểm tra khoản thu và quyết định khấu trừ, hoàn tiền cọc.', 'Theo dõi tài chính, bảng giá và báo cáo.'],
  },
  BUSINESS_OPERATIONS_MANAGER: {label:'Điều hành kinh doanh',icon:BriefcaseBusiness,description:'Quản lý nghiệp vụ toàn hệ thống.',access:['Quản lý cơ sở, chính sách thuê và khung giá.','Xem báo cáo toàn hệ thống.']},
  SYSTEM_ADMINISTRATOR: {
    label: 'Quản trị viên', icon: ShieldCheck,
    description: 'Quản trị tài khoản và theo dõi nhật ký hệ thống.',
    access: ['Quản lý tài khoản, vai trò và cấp hoặc thu hồi quyền cơ sở.', 'Cập nhật thông tin liên hệ và quản lý trạng thái tài khoản.', 'Xem lịch sử đăng nhập và nhật ký hoạt động.'],
  },
};

function roleInfo(value: unknown) {
  return typeof value === 'string' && Object.hasOwn(adminRoles, value) ? adminRoles[value as keyof typeof adminRoles] : undefined;
}

export function AccountRole({ value }: { value: unknown }) {
  const role = roleInfo(value);
  if (!role) return <span>—</span>;
  const { label, icon: Icon } = role;
  return <span className="admin-role"><Icon size={16} aria-hidden="true" />{label}</span>;
}

export function AccountRoleAccess({ value }: { value: unknown }) {
  const role = roleInfo(value);
  if (!role) return <p>Chưa xác định vai trò của tài khoản.</p>;
  return <div className="admin-role-access">
    <h2>Quyền truy cập hiện tại</h2>
    <p>Mục này dùng để xem quyền theo vai trò hiện tại của tài khoản.</p>
    <p>{role.description}</p>
    <ul>{role.access.map(permission => <li key={permission}>{permission}</li>)}</ul>
  </div>;
}
