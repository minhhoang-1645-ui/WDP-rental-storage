import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
import { Link } from 'react-router-dom';
import { Modal, PageHeader } from '../../components/manager/PortalUi';
import { Building2, ChartNoAxesColumn, Check, ClipboardCheck, Eye, Info, ShieldCheck, UserRound } from 'lucide-react';

const adminRoles = {
  SYSTEM_ADMINISTRATOR: {
    label: 'Quản trị viên', english: 'System Administrator', icon: ShieldCheck,
    scope: 'Quản trị toàn hệ thống',
    access: [
      'Quản lý tài khoản và trạng thái truy cập, cấp vai trò khi tạo tài khoản nội bộ và đổi vai trò theo quy định.',
      'Cấp hoặc thu hồi quyền truy cập cơ sở và quản lý phiên đăng nhập.',
      'Tra cứu lịch sử đăng nhập, nhật ký hoạt động và lịch sử thay đổi quyền.',
    ],
    limits: 'Không trực tiếp xử lý nghiệp vụ thuê kho hoặc điều phối nhân viên cơ sở.',
  },
  BUSINESS_OPERATIONS_MANAGER: {
    label: 'Điều hành kinh doanh', english: 'Business Operations Manager', icon: ChartNoAxesColumn,
    scope: 'Điều hành kinh doanh toàn hệ thống',
    access: [
      'Quản lý cơ sở, trạng thái kinh doanh, giờ hoạt động và lịch phục vụ tùy chọn.',
      'Thiết lập chính sách kinh doanh, công bố khung giá theo cơ sở và nhóm kho.',
      'Quản lý danh mục bổ trợ chung và theo dõi doanh thu, hiệu quả cơ sở.',
      'Quyết định phương án ngừng kinh doanh cơ sở.',
    ],
    limits: 'Không trực tiếp xếp ca, phân công nhân viên hoặc quản trị tài khoản.',
  },
  FACILITY_MANAGER: {
    label: 'Quản lý cơ sở', english: 'Facility Manager', icon: Building2,
    scope: 'Các cơ sở được cấp quyền',
    access: [
      'Quản lý loại kho, đơn giá, danh sách kho và dịch vụ bổ trợ tại cơ sở.',
      'Xếp ca, điều phối nhân viên, quản lý lịch hẹn và hồ sơ thuê kho.',
      'Tra cứu thông tin khách hàng tại cơ sở.',
      'Xử lý ngoại lệ bàn giao, gia hạn, chuyển kho và trả kho.',
      'Xử lý hỗ trợ, khiếu nại và nghiệm thu bảo trì.',
      'Quản lý hóa đơn, khoản thu và hoàn tiền. Theo dõi báo cáo hoạt động cơ sở.',
    ],
    limits: 'Chỉ xử lý tại cơ sở được cấp quyền. Chính sách kinh doanh và khung giá theo nhóm kho do Điều hành kinh doanh quản lý.',
  },
  FACILITY_STAFF: {
    label: 'Nhân viên cơ sở', english: 'Facility Staff', icon: ClipboardCheck,
    scope: 'Nhiệm vụ tại cơ sở được cấp quyền',
    access: [
      'Xem ca làm, xác nhận vào ca và kết thúc ca.',
      'Tiếp nhận và thực hiện nhiệm vụ bàn giao, chuyển kho, kiểm tra trả kho, bảo trì và hỗ trợ khách hàng.',
      'Báo cáo sự cố, ghi nhận kết quả và chuyển quản lý xử lý khi vượt thẩm quyền.',
    ],
    limits: 'Không quản lý giá thuê, chính sách, tài khoản hoặc quyết toán tài chính. Không kiểm kê tài sản cá nhân của khách.',
  },
  STORAGE_CUSTOMER: {
    label: 'Khách thuê kho', english: 'Storage Customer', icon: UserRound,
    scope: 'Hồ sơ và giao dịch của tài khoản',
    access: [
      'Tìm và đặt thuê kho, ký hợp đồng, thanh toán hóa đơn và đặt lịch nhận kho.',
      'Mua hoặc thuê dịch vụ bổ trợ. Gửi yêu cầu gia hạn, chuyển kho, trả kho và hỗ trợ.',
      'Theo dõi hồ sơ thuê, lịch sử thanh toán, thông báo và tiến độ yêu cầu trên ứng dụng NestBox.',
    ],
    limits: 'Chỉ truy cập hồ sơ và giao dịch của chính mình.',
  },
};
type RoleInfo = (typeof adminRoles)[keyof typeof adminRoles];

function roleInfo(value: unknown) {
  return typeof value === 'string' && Object.hasOwn(adminRoles, value) ? adminRoles[value as keyof typeof adminRoles] : undefined;
}

export const accountRoleLabel = (value: string) => roleInfo(value)?.label ?? value;

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
    <h2>Vai trò và quyền truy cập</h2>
    <dl className="admin-permission-facts">
      <div><dt>Vai trò hiện tại</dt><dd><AccountRole value={value} /></dd></div>
      <div><dt>Phạm vi quyền</dt><dd>{role.scope}</dd></div>
    </dl>
    <RolePermissions role={role} />
  </div>;
}

function RolePermissions({ role, modal = false }: { role: RoleInfo; modal?: boolean }) {
  const permissions = modal ? role.access.flatMap(permission => permission.split(/(?<=\.) /)) : role.access;
  return <div className="admin-role-permissions">
    <h3>Quyền và trách nhiệm chính</h3>
    <ul role={modal ? 'list' : undefined}>{permissions.map(permission => <li key={permission}>
      {modal && <Check size={16} aria-hidden="true" />}
      <span>{permission}</span>
    </li>)}</ul>
    {modal ? <div className="admin-role-limits">
      <Info size={17} aria-hidden="true" />
      <div><h3>Giới hạn quyền hạn</h3><p>{role.limits}</p></div>
    </div> : <><h3>Giới hạn quyền hạn</h3><p>{role.limits}</p></>}
  </div>;
}

export function AdminRolesPage() {
  const [modalHost, setModalHost] = useState<HTMLDivElement | null>(null);
  return <section className="admin-roles-page">
    <PageHeader title="Vai trò và phân quyền" />
    <div className="manager-table-wrap admin-roles-table">
      <table className="manager-table" aria-label="Danh sách vai trò">
        <thead><tr>
          <th scope="col">Vai trò</th><th scope="col">Phạm vi truy cập</th>
          <th scope="col">Số tài khoản</th><th scope="col">Thao tác</th>
        </tr></thead>
        <tbody>{Object.entries(adminRoles).map(([value, role]) => <RoleRow key={value} value={value} role={role} modalHost={modalHost} />)}</tbody>
      </table>
    </div>
    <div ref={setModalHost} />
  </section>;
}

function RoleRow({ value, role, modalHost }: { value: string; role: RoleInfo; modalHost: HTMLDivElement | null }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const source = useApiResource<{ total: number }>(user?.id ? '/admin/users?limit=1&role=' + encodeURIComponent(value) : null, user?.id);
  const total = source.data?.total;
  const count = typeof total === 'number' && Number.isSafeInteger(total) && total >= 0 ? total.toLocaleString('vi-VN') : null;
  const to = '/admin/users?' + new URLSearchParams({ role: value });
  const { icon: Icon } = role;
  const countState = source.loading || source.refreshing
    ? <span className="admin-role-count-state" role="status">Đang tải…</span>
    : <span className="admin-role-count-state">Chưa tải được
      <button type="button" className="portal-text-button" aria-label={`Tải lại số tài khoản · ${role.label}`}
        onClick={source.refresh}>Thử lại</button>
    </span>;
  return <tr>
    <th scope="row">
      <button type="button" className="admin-role-name" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span className="admin-role-icon"><Icon size={18} aria-hidden="true" /></span>
        <span><strong>{role.label}</strong><small>{role.english}</small></span>
      </button>
    </th>
    <td>{role.scope}</td>
    <td>{count === null ? countState : <Link className="admin-role-account-count" to={to}
      aria-label={`${count} tài khoản · ${role.label}`}>{count}</Link>}</td>
    <td>
      <button type="button" className="button-secondary icon-button" aria-label={`Xem chi tiết · ${role.label}`}
        aria-haspopup="dialog" onClick={() => setOpen(true)}><Eye size={17} aria-hidden="true" /></button>
      {open && modalHost && createPortal(<Modal title={role.label} titleBadge={<span className="admin-role-icon"><Icon size={18} aria-hidden="true" /></span>}
        subtitle={<p className="admin-role-english">{role.english}</p>} focusTitle className="admin-role-dialog" onClose={() => setOpen(false)}
        footer={<>
          <button type="button" className="button-secondary" onClick={() => setOpen(false)}>Đóng</button>
          <Link className="button-primary" to={to}>Xem danh sách tài khoản</Link>
        </>}>
        <dl className="admin-role-dialog-facts">
          <div><dt>Phạm vi truy cập</dt><dd>{role.scope}</dd></div>
          <div><dt>Số tài khoản</dt><dd>{count === null ? countState : count + ' tài khoản'}</dd></div>
        </dl>
        <RolePermissions role={role} modal />
      </Modal>, modalHost)}
    </td>
  </tr>;
}
