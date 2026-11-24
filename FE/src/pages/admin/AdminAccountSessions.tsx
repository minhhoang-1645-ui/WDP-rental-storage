import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { date } from '../../components/manager/portal-data';
import { LoadState, Modal } from '../../components/manager/PortalUi';
import { apiRequest } from '../../services/api';
import { AssignmentImpact, type AccountAccess } from './AdminFacilityAccessPage';

type Props = {
  accountId: string;
  ownAccount: boolean;
  access: AccountAccess | null;
  loading: boolean;
  refreshing: boolean;
  loadError: string;
  refresh: () => void;
};

export function AdminAccountSessions({ accountId, ownAccount, access, loading, refreshing, loadError, refresh }: Props) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  async function revoke() {
    if (lock.current || ownAccount) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await apiRequest<{ count: number }>('/admin/users/' + encodeURIComponent(accountId) + '/sessions/revoke', { method: 'PATCH' });
      setNotice('Đã thu hồi ' + result.count + ' phiên.');
      setConfirm(false);
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Chưa thu hồi được phiên.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return <section className="manager-section admin-detail-panel">
    <h2>Phiên đăng nhập</h2>
    <Link to={'/admin/login-history?accountId=' + encodeURIComponent(accountId)}>Xem thời điểm đăng nhập trong nhật ký</Link>
    <LoadState loading={loading} error={loadError} retry={refresh} />
    {notice && <p className="portal-success" role="status">{notice}</p>}
    {access && <>
      {access.sessions.length ? <div className="manager-table-wrap"><table className="manager-table">
        <thead><tr><th>Hết hạn (UTC+7)</th><th>Trạng thái</th></tr></thead>
        <tbody>{access.sessions.map((session, index) => <tr key={session.expiresAt + ':' + index}>
          <td>{date(session.expiresAt, true)}</td><td>{session.status === 'ACTIVE' ? 'Còn hiệu lực' : 'Đã thu hồi'}</td>
        </tr>)}</tbody>
      </table></div> : <p>Không có phiên còn trong thời hạn lưu.</p>}
      <AssignmentImpact access={access} />
      {!ownAccount && <div><button type="button" className="button-secondary portal-danger"
        disabled={busy || refreshing || !access.sessions.some(session => session.status === 'ACTIVE')}
        onClick={() => { setError(''); setConfirm(true); }}>Thu hồi toàn bộ phiên</button></div>}
    </>}
    {confirm && <Modal title="Xác nhận thu hồi toàn bộ phiên" busy={busy} onClose={() => setConfirm(false)} footer={<>
      <button type="button" className="button-secondary" disabled={busy} onClick={() => setConfirm(false)}>Hủy</button>
      <button type="button" className="button-secondary portal-danger" disabled={busy} onClick={() => void revoke()}>Thu hồi phiên</button>
    </>}>
      <p>Tài khoản sẽ phải đăng nhập lại. Phân công hiện tại vẫn thuộc tài khoản này.</p>
      <AssignmentImpact access={access} />
      {error && <p className="booking-alert is-error" role="alert">{error}</p>}
    </Modal>}
  </section>;
}
