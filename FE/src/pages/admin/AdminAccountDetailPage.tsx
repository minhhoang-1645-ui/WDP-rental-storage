import { ArrowLeft, RefreshCw, ShieldCheck } from 'lucide-react';
import { AccountRole } from './AccountRole';
import { useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
import { mutate } from '../../services/portal';
import { date, first, type Row } from '../../components/manager/portal-data';
import { Facts, LoadState, Modal, PageHeader, Status } from '../../components/manager/PortalUi';
import { CopyRecordCode } from '../../components/workspace/RecordIdentity';
import { useInternalListReturn } from '../../components/workspace/internal-list-memory';

export function AdminAccountDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [notice, setNotice] = useState<{ id: string; text: string }>();
  const back = useInternalListReturn('/admin/users');
  const path = `/admin/users/${encodeURIComponent(id)}`;
  const detail = useApiResource<Row>(id && user?.id ? path : null, user?.id);
  const row = detail.data;
  const next = row?.accountStatus === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
  const canChange = Boolean(row && user?.id && id !== user.id && ['ACTIVE', 'DISABLED'].includes(String(row.accountStatus)));
  const close = () => setParams({}, { replace: true });
  return <section className="admin-account-detail">
    <Link className="booking-back" to={back}><ArrowLeft size={17} />Về danh sách tài khoản</Link>
    <PageHeader title={first(row ?? {}, 'fullName') || 'Thông tin tài khoản'}>
      <button type="button" className="button-secondary" disabled={detail.loading || detail.refreshing} onClick={detail.refresh}><RefreshCw size={16} />Làm mới</button>
    </PageHeader>
    {notice?.id === id && <p className="portal-success" role="status">{notice.text}</p>}
    <LoadState loading={detail.loading} error={detail.error} retry={detail.refresh} />
    {row && <>
      <div className="admin-detail-grid">
        <section className="manager-section">
          <div className="admin-detail-heading"><h2>Thông tin tài khoản</h2><Status value={row.accountStatus} /></div>
          <Facts items={[
            ['Email', first(row, 'email')],
            ['Số điện thoại', first(row, 'phone') || 'Chưa cập nhật'],
            ['Vai trò', <AccountRole key="role" value={row.role} />],
            ['Ngày tạo', date(row.createdAt, true)],
            ['Cập nhật lần cuối', date(row.updatedAt, true)],
          ]} />
          <CopyRecordCode value={first(row, 'id')} label="Mã tài khoản" />
        </section>
        <section className="manager-section">
          <div className="admin-detail-heading"><h2>Quyền truy cập</h2><ShieldCheck size={19} aria-hidden="true" /></div>
          {id === user?.id ? <p>Bạn đang dùng tài khoản này.</p> : canChange && <>
            <p>{next === 'DISABLED' ? 'Tài khoản sẽ bị chặn truy cập và đăng nhập trong thời gian vô hiệu hóa. Hồ sơ vẫn được lưu.' : 'Kích hoạt lại cho phép người dùng đăng nhập.'}</p>
            <button type="button" disabled={detail.refreshing} className={next === 'DISABLED' ? 'button-secondary portal-danger' : 'button-primary'}
              onClick={() => setParams({ status: next }, { replace: true })}>{next === 'DISABLED' ? 'Vô hiệu hóa tài khoản' : 'Kích hoạt lại tài khoản'}</button>
          </>}
        </section>
      </div>
      {canChange && params.get('status') === next && <StatusConfirmation key={`${id}:${next}`}
        path={path} name={first(row, 'fullName')} next={next} onClose={close} onSaved={updated => {
          setNotice({ id, text: `Đã cập nhật trạng thái tài khoản ${first(updated, 'fullName')}.` });
          close();
          detail.refresh();
        }} />}
    </>}
  </section>;
}

function StatusConfirmation({ path, name, next, onClose, onSaved }: {
  path: string; name: string; next: 'ACTIVE' | 'DISABLED'; onClose: () => void; onSaved: (updated: Row) => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const disable = next === 'DISABLED';
  return <Modal title={disable ? 'Xác nhận vô hiệu hóa' : 'Xác nhận kích hoạt lại'} busy={busy} onClose={onClose}>
    <form className="portal-form" onSubmit={async event => {
      event.preventDefault();
      if (!confirmed || lock.current) return;
      lock.current = true;
      setBusy(true);
      setError('');
      try { onSaved(await mutate(`${path}/status`, 'PATCH', { accountStatus: next })); }
      catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể cập nhật trạng thái.'); }
      finally { lock.current = false; setBusy(false); }
    }}>
      <p><strong>{name}</strong> · {disable ? 'Chặn quyền truy cập của tài khoản.' : 'Khôi phục quyền đăng nhập.'}</p>
      <label className="portal-checkbox"><input type="checkbox" required checked={confirmed} disabled={busy}
        onChange={event => setConfirmed(event.target.checked)} />Tôi xác nhận thay đổi quyền truy cập</label>
      {error && <p className="booking-alert is-error" role="alert">{error}</p>}
      <div className="portal-actions">
        <button type="button" className="button-secondary" disabled={busy} onClick={onClose}>Hủy</button>
        <button type="submit" className={disable ? 'button-secondary portal-danger' : 'button-primary'} disabled={!confirmed || busy}>
          {busy ? 'Đang lưu…' : disable ? 'Vô hiệu hóa tài khoản' : 'Kích hoạt tài khoản'}
        </button>
      </div>
    </form>
  </Modal>;
}
