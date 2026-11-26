import { LogIn, LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';
import { date } from '../../components/manager/portal-data';
import { Empty, Facts, LoadState, Modal, Status } from '../../components/manager/PortalUi';
import { useApiResource } from '../../services/useApiResource';
import { accountRoleLabel } from './AccountRole';
import { auditRole, auditTitle, type AuditEvent } from './audit-labels';

const profilePath = (id: string) => '/admin/users/' + encodeURIComponent(id);
type Account = { id: string; fullName?: string; email?: string };
const clock = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export function loginRole(role?: string | null) {
  return role ? accountRoleLabel(auditRole(role === 'ADMIN' ? 'SYSTEM_ADMINISTRATOR' : role)) : 'Không ghi nhận';
}

export function LoginEventTime({ value }: { value: string }) {
  const parsed = new Date(value);
  if (!Number.isFinite(+parsed)) return <span>—</span>;
  return <time className="admin-login-time" dateTime={value}><span>{clock.format(parsed)}</span><small>{date(value)}</small></time>;
}

export function LoginEventLabel({ event }: { event: AuditEvent }) {
  const Icon = event.action === 'AUTH_LOGOUT' ? LogOut : LogIn;
  const text = event.action === 'AUTH_LOGOUT' ? 'Đăng xuất' : event.action === 'AUTH_LOGIN_ACCOUNT_DISABLED'
    ? 'Đăng nhập tài khoản đã khóa' : event.action === 'AUTH_LOGIN' ? 'Đăng nhập' : auditTitle(event);
  return <span className="admin-login-event"><Icon size={16} aria-hidden="true" /><span>{text}</span></span>;
}

export function AuditAccountScope({ id, adminId }: { id: string; adminId?: string }) {
  const account = useApiResource<Account>(adminId ? profilePath(id) : null, adminId);
  const name = account.data?.fullName || account.data?.email;
  return <span>Đang lọc theo tài khoản{name && <> · <strong>{name}</strong></>}</span>;
}

export function LoginEventDetail({ event, adminId, loaded, loading, error, retry, close }: {
  event?: AuditEvent; adminId?: string; loaded: boolean; loading: boolean;
  error: string; retry: () => void; close: () => void;
}) {
  const account = useApiResource<Account>(adminId && event?.actorId ? profilePath(event.actorId) : null, adminId);
  const accountId = event?.actorId;
  const accountLink = accountId && account.data?.id === accountId ? profilePath(accountId) : null;
  return <Modal title="Chi tiết sự kiện" subtitle={event && <LoginEventLabel event={event} />}
    className="admin-login-event-dialog" focusTitle onClose={close} footer={<>
      <button type="button" className="button-secondary" onClick={close}>Đóng</button>
      {accountLink && <Link className="button-primary" to={accountLink}>Xem hồ sơ tài khoản</Link>}
    </>}>
    <LoadState loading={loading} error={error} retry={retry} layout="detail" />
    {event ? <Facts items={[
      ['Kết quả', <Status value={event.outcome === 'SUCCESS' ? 'ACTIVE' : 'REJECTED'}
        text={event.outcome === 'SUCCESS' ? 'Thành công' : 'Thất bại'} />],
      ['Thời gian (UTC+7)', <time dateTime={event.createdAt}>{date(event.createdAt, true)}</time>],
      ['Tài khoản', event.actorName || event.attemptAccountName || 'Không ghi nhận'],
      ['Email', event.actorEmail || 'Không ghi nhận'],
      ['Vai trò tại thời điểm sự kiện', loginRole(event.actorRole)],
      ...(event.ipAddress ? [['Địa chỉ IP', event.ipAddress] as [string, string]] : []),
      ...(event.outcome === 'FAILURE' && event.action === 'AUTH_LOGIN_ACCOUNT_DISABLED'
        ? [['Nguyên nhân', 'Tài khoản đã khóa.'] as [string, string]] : []),
    ]} /> : loaded && <Empty title="Không tìm thấy sự kiện đăng nhập" description="Mở danh sách để xem các sự kiện hiện có." />}
  </Modal>;
}
