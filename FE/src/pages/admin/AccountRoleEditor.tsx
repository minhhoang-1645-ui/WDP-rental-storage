import { useRef, useState } from 'react';
import { Modal } from '../../components/manager/PortalUi';
import { mutate } from '../../services/portal';
import { AccountRole } from './AccountRole';
import { AssignmentImpact, type AccountAccess } from './AdminFacilityAccessPage';

const roles = {
  FACILITY_STAFF: 'Nhân viên cơ sở',
  FACILITY_MANAGER: 'Quản lý cơ sở',
  BUSINESS_OPERATIONS_MANAGER: 'Điều hành kinh doanh',
};

export function AccountRoleEditor({ id, currentRole, access, onSaved }: {
  id: string; currentRole: string; access: AccountAccess | null; onSaved: () => void;
}) {
  const [role, setRole] = useState(currentRole);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  if (!Object.prototype.hasOwnProperty.call(roles, currentRole)) return null;
  const blocked = Boolean(access?.openAssignments || access?.history.some(item => !item.revokedAt));
  async function save() {
    if (lock.current || role === currentRole || blocked) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await mutate('/admin/facility-access/users/' + encodeURIComponent(id) + '/role', 'PATCH', { role, expectedRole: currentRole });
      setConfirm(false);
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không đổi được vai trò.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return <div className="portal-form">
    <h3>Thay đổi vai trò nội bộ</h3>
    <AssignmentImpact access={access} />
    {access?.history.some(item => !item.revokedAt) && <p>Cần thu hồi các quyền cơ sở còn hiệu lực trước khi đổi vai trò.</p>}
    <label>Vai trò mới<select value={role} onChange={event => setRole(event.target.value)} disabled={busy}>
      {Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select></label>
    <div><button type="button" className="button-primary" disabled={busy || blocked || role === currentRole}
      onClick={() => { setError(''); setConfirm(true); }}>Đổi vai trò</button></div>
    {confirm && <Modal title="Xác nhận đổi vai trò" busy={busy} onClose={() => setConfirm(false)} footer={<>
      <button type="button" className="button-secondary" disabled={busy} onClick={() => setConfirm(false)}>Hủy</button>
      <button type="button" className="button-primary" disabled={busy || blocked} onClick={() => void save()}>{busy ? 'Đang cập nhật…' : 'Xác nhận đổi'}</button>
    </>}>
      <p>Vai trò hiện tại: <AccountRole value={currentRole} /></p>
      <p>Vai trò mới: <AccountRole value={role} /></p>
      <p>Các phiên của tài khoản sẽ kết thúc. Người dùng cần đăng nhập lại.</p>
      <AssignmentImpact access={access} />
      {error && <p className="booking-alert is-error" role="alert">{error}</p>}
    </Modal>}
  </div>;
}
