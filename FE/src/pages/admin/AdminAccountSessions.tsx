import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { date } from '../../components/manager/portal-data';
import { Facts, LoadState, Modal, Pagination } from '../../components/manager/PortalUi';
import { apiRequest } from '../../services/api';
import { useApiResource } from '../../services/useApiResource';
import { AssignmentImpact, type AccountAccess } from './AdminFacilityAccessPage';

type Session = {
  id: string;
  userId: string;
  device: string | null;
  createdAt: string | null;
  expiresAt: string;
  revokedAt: string | null;
  revokedById: string | null;
  revocationReason: string | null;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
};

type SessionPage = { items: Session[]; page: number; limit: number; total: number; activeCount: number };
const sessionStatus: Record<Session['status'], string> = {
  ACTIVE: 'Còn hiệu lực', REVOKED: 'Đã thu hồi', EXPIRED: 'Đã hết hạn',
};
const reasonLabels: Record<string, string> = {
  ADMIN: 'Quản trị viên thu hồi', ACCOUNT_DISABLED: 'Khóa tài khoản', ROLE_CHANGED: 'Đổi vai trò',
  FACILITY_ACCESS_REVOKED: 'Thu hồi quyền cơ sở', LOGOUT: 'Đăng xuất',
  PASSWORD_CHANGED: 'Đổi mật khẩu', PASSWORD_RESET: 'Đặt lại mật khẩu',
};

export function AdminAccountSessions({ accountId, accountName, adminId, access, refreshAccess }: {
  accountId: string; accountName: string; adminId: string; access: AccountAccess | null; refreshAccess: () => void;
}) {
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState('');
  const [confirm, setConfirm] = useState<'all' | Session>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  const base = '/admin/users/' + encodeURIComponent(accountId) + '/sessions';
  const source = useApiResource<SessionPage>(adminId && access?.sessionManagement ? base + '?page=' + page : null, adminId, true);
  const detail = useApiResource<Session>(detailId ? base + '/' + encodeURIComponent(detailId) : null, adminId);
  const activeCount = source.data?.activeCount ?? 0;
  const detailSession = detail.data;
  const legacyApi = (access != null && !access.sessionManagement) || source.status === 404 && source.error.startsWith('Cannot GET /api/admin/users/');

  function openConfirmation(selection: 'all' | Session) {
    setError('');
    setDetailId('');
    setConfirm(selection);
  }

  async function revoke() {
    if (!adminId || lock.current || !confirm || source.loading || source.refreshing || !source.data) return;
    if (confirm === 'all' ? !activeCount : confirm.status !== 'ACTIVE') return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const path = confirm === 'all' ? base + '/revoke' : base + '/' + encodeURIComponent(confirm.id) + '/revoke';
      const result = await apiRequest<{ count: number }>(path, { method: 'PATCH' });
      if (!Number.isSafeInteger(result?.count) || result.count < 0) throw new Error('Chưa xác minh được kết quả thu hồi. Hãy làm mới danh sách phiên.');
      setNotice(result.count ? 'Đã thu hồi ' + result.count + ' phiên.' : 'Không còn phiên phù hợp còn hiệu lực để thu hồi.');
      setConfirm(undefined);
      source.refresh();
      refreshAccess();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Chưa thu hồi được phiên.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return <section className="manager-section admin-detail-panel">
    <h2>Phiên đăng nhập</h2>
    <div className="portal-actions">
      <Link to={'/admin/login-history?accountId=' + encodeURIComponent(accountId)}>Xem lịch sử đăng nhập</Link>
      <button type="button" className="button-secondary" onClick={() => { source.refresh(); refreshAccess(); }} disabled={source.loading || source.refreshing || busy}>Làm mới phiên</button>
    </div>
    <LoadState loading={source.loading} error={legacyApi ? '' : source.error} retry={source.refresh} />
    {legacyApi && <>
      <p role="status">Backend hiện tại chỉ cung cấp phiên chưa hết hạn. Xem lịch sử đăng nhập để tra cứu thời điểm vào hệ thống.</p>
      {access?.sessions.length ? <div className="manager-table-wrap"><table className="manager-table">
        <thead><tr><th>Hết hạn (UTC+7)</th><th>Trạng thái</th></tr></thead>
        <tbody>{access.sessions.map((session, index) => <tr key={session.expiresAt + ':' + index}>
          <td>{date(session.expiresAt, true)}</td>
          <td>{session.status === 'ACTIVE' ? 'Còn hiệu lực' : 'Đã thu hồi'}</td>
        </tr>)}</tbody>
      </table></div> : access && <p>Không có phiên nào chưa hết hạn.</p>}
      {!access && <p>Chưa tải được thông tin phiên. <button type="button" className="button-secondary" onClick={refreshAccess}>Thử lại</button></p>}
    </>}
    {notice && <p className="portal-success" role="status">{notice}</p>}
    {source.data && <>
      <p><strong>{activeCount}</strong> phiên còn hiệu lực</p>
      {source.data.items.length ? <div className="manager-table-wrap"><table className="manager-table">
        <thead><tr><th>Thiết bị</th><th>Đăng nhập (UTC+7)</th><th>Hết hạn (UTC+7)</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
        <tbody>{source.data.items.map(session => <tr key={session.id}>
          <td>{session.device || 'Chưa ghi nhận'}</td>
          <td>{session.createdAt ? date(session.createdAt, true) : 'Chưa ghi nhận'}</td>
          <td>{date(session.expiresAt, true)}</td>
          <td>{sessionStatus[session.status]}</td>
          <td><div className="portal-actions">
            <button type="button" className="button-secondary" onClick={() => setDetailId(session.id)}>Chi tiết</button>
            {session.status === 'ACTIVE' && <button type="button" className="button-secondary portal-danger"
              disabled={busy || source.refreshing || !adminId} onClick={() => openConfirmation(session)}>Thu hồi</button>}
          </div></td>
        </tr>)}</tbody>
      </table></div> : <p>Tài khoản chưa có lịch sử phiên đăng nhập.</p>}
      {source.data.total > source.data.limit && <Pagination page={page} limit={source.data.limit} total={source.data.total}
        onChange={setPage} disabled={source.refreshing || busy} />}
      <AssignmentImpact access={access} />
      <div><button type="button" className="button-secondary portal-danger" disabled={busy || source.refreshing || !activeCount || !adminId}
        onClick={() => openConfirmation('all')}>Thu hồi toàn bộ phiên</button></div>
    </>}
    {detailId && <Modal title="Chi tiết phiên đăng nhập" onClose={() => setDetailId('')}>
      <LoadState loading={detail.loading} error={detail.error} retry={detail.refresh} />
      {detailSession && <Facts items={[
        ['Mã phiên', detailSession.id],
        ['Tài khoản', accountName],
        ['Thiết bị', detailSession.device || 'Chưa ghi nhận'],
        ['Đăng nhập (UTC+7)', detailSession.createdAt ? date(detailSession.createdAt, true) : 'Chưa ghi nhận'],
        ['Hoạt động gần nhất', 'Chưa ghi nhận'],
        ['Hết hạn (UTC+7)', date(detailSession.expiresAt, true)],
        ['Trạng thái', sessionStatus[detailSession.status]],
        ...(detailSession.revokedAt ? [['Thu hồi lúc', date(detailSession.revokedAt, true)] as [string, string]] : []),
        ...(detailSession.revokedById ? [['Mã người thu hồi', detailSession.revokedById] as [string, string]] : []),
        ...(detailSession.revocationReason ? [['Lý do', reasonLabels[detailSession.revocationReason] ?? detailSession.revocationReason] as [string, string]] : []),
      ]} />}
    </Modal>}
    {confirm && <Modal title={confirm === 'all' ? 'Xác nhận thu hồi toàn bộ phiên' : 'Xác nhận thu hồi phiên'}
      className="admin-confirm-dialog" busy={busy} onClose={() => setConfirm(undefined)} footer={<>
        <button type="button" className="button-secondary" disabled={busy} onClick={() => setConfirm(undefined)}>Hủy</button>
        <button type="button" className="button-secondary portal-danger" disabled={busy || !adminId || source.loading || source.refreshing || !source.data || (confirm === 'all' && !activeCount)}
          onClick={() => void revoke()}>{busy ? 'Đang thu hồi…' : 'Thu hồi phiên'}</button>
      </>}>
      <div className="admin-confirm-target"><span>Tài khoản bị tác động</span><strong>{accountName}</strong></div>
      {confirm === 'all' ? <p>Số phiên đang hoạt động: <strong>{activeCount}</strong></p>
        : <Facts items={[[ 'Thiết bị', confirm.device || 'Chưa ghi nhận' ], [ 'Mã phiên', confirm.id ]]} />}
      {accountId === adminId && <p role="alert">Bạn đang quản lý tài khoản của mình. Nếu phiên hiện tại bị thu hồi, bạn sẽ phải đăng nhập lại.</p>}
      <p>Người dùng phải đăng nhập lại trên thiết bị có phiên bị thu hồi. Phân công hiện tại vẫn thuộc tài khoản này.</p>
      <AssignmentImpact access={access} />
      {error && <p className="booking-alert is-error" role="alert">{error}</p>}
    </Modal>}
  </section>;
}
