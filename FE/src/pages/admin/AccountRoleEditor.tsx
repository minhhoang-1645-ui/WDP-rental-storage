import { ArrowRight } from 'lucide-react';
import { useRef, useState } from 'react';
import { Modal } from '../../components/manager/PortalUi';
import { ApiError } from '../../services/api';
import { mutate } from '../../services/portal';
import { AccountRole } from './AccountRole';
import { AssignmentImpact, type AccountAccess } from './AdminFacilityAccessPage';

const roles = {
  FACILITY_STAFF: 'Nhân viên cơ sở',
  FACILITY_MANAGER: 'Quản lý cơ sở',
  BUSINESS_OPERATIONS_MANAGER: 'Điều hành kinh doanh',
};

export function AccountRoleEditor({ id, currentRole, access, refreshing, onSaved, onRefresh }: {
  id: string; currentRole: string; access: AccountAccess | null; refreshing: boolean; onSaved: () => void; onRefresh: () => void;
}) {
  const [role, setRole] = useState(currentRole);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const [requiresRefresh, setRequiresRefresh] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  if (!Object.prototype.hasOwnProperty.call(roles, currentRole)) return null;
  const blocked = Boolean(access?.openAssignments || access?.history.some(item => !item.revokedAt));
  async function save() {
    if (lock.current || role === currentRole || blocked || refreshing || requiresRefresh) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await mutate('/admin/facility-access/users/' + encodeURIComponent(id) + '/role', 'PATCH', { role, expectedRole: currentRole });
      setConfirm(false);
      onSaved();
    } catch (caught) {
      const mustVerify = !(caught instanceof ApiError) || caught.status >= 500 || caught.status === 409;
      setRequiresRefresh(mustVerify);
      setError(caught instanceof ApiError && caught.status >= 500
        ? 'Máy chủ gặp lỗi khi đổi vai trò. Hãy tải lại hồ sơ để kiểm tra vai trò hiện tại trước khi thử lại.'
        : caught instanceof Error ? caught.message : 'Chưa xác minh được kết quả đổi vai trò.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function close() {
    if (requiresRefresh) {
      onRefresh();
      setRole(currentRole);
      setRequiresRefresh(false);
    }
    setConfirm(false);
  }
  return <div className="portal-form">
    <h3>Thay đổi vai trò nội bộ</h3>
    <AssignmentImpact access={access} />
    {access?.history.some(item => !item.revokedAt) && <p>Cần thu hồi các quyền cơ sở còn hiệu lực trước khi đổi vai trò.</p>}
    <label>Vai trò mới<select value={role} onChange={event => setRole(event.target.value)} disabled={busy}>
      {Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select></label>
    <div><button type="button" className="button-primary" disabled={busy || blocked || refreshing || requiresRefresh || role === currentRole}
      onClick={() => { setError(''); setConfirm(true); }}>Đổi vai trò</button></div>
    {confirm && <Modal title="Xác nhận đổi vai trò" className="admin-confirm-dialog" busy={busy} onClose={close} footer={<>
      <button type="button" className="button-secondary" disabled={busy} onClick={close}>Hủy</button>
      {requiresRefresh ? <button type="button" className="button-primary" onClick={close}>Tải lại hồ sơ</button> : <button type="button" className="button-primary" disabled={busy || blocked}
        onClick={() => void save()}>{busy ? 'Đang cập nhật…' : 'Xác nhận đổi'}</button>}
    </>}>
      <div className="admin-role-transition">
        <div><small>Vai trò hiện tại</small><AccountRole value={currentRole} /></div>
        <ArrowRight size={17} aria-hidden="true" />
        <div><small>Vai trò mới</small><AccountRole value={role} /></div>
      </div>
      <p>Các phiên của tài khoản sẽ kết thúc. Người dùng cần đăng nhập lại.</p>
      <AssignmentImpact access={access} />
      {error && <p className="booking-alert is-error" role="alert">{error}</p>}
    </Modal>}
  </div>;
}
