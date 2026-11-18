import { ArrowLeft, Pencil, RefreshCw } from 'lucide-react';
import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
import { mutate } from '../../services/portal';
import { date, first, type Row } from '../../components/manager/portal-data';
import { DetailDisclosure } from '../../components/workspace/DetailDisclosure';
import { Facts, LoadState, Modal, PageHeader, Status } from '../../components/manager/PortalUi';
import { useInternalListReturn } from '../../components/workspace/internal-list-memory';
import { AccountRole, AccountRoleAccess } from './AccountRole';

const tabs = [
  { id: 'profile', label: 'Thông tin tài khoản' },
  { id: 'permissions', label: 'Phân quyền' },
] as const;
type AccountTab = typeof tabs[number]['id'];

export function AdminAccountDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [editingId, setEditingId] = useState('');
  const [saved, setSaved] = useState<{ id: string; row: Row; previous: Row | null; text: string }>();
  const back = useInternalListReturn('/admin/users');
  const path = '/admin/users/' + encodeURIComponent(id);
  const detail = useApiResource<Row>(id && user?.id ? path : null, user?.id, false, true);
  const row = saved?.id === id && (!detail.data || saved.previous === detail.data) ? saved.row : detail.data;
  const status = params.get('status');
  const tab: AccountTab = params.get('tab') === 'permissions' || Boolean(status) ? 'permissions' : 'profile';
  const next = row?.accountStatus === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
  const canChange = Boolean(row && user?.id && id !== user.id && ['ACTIVE', 'DISABLED'].includes(String(row.accountStatus)));

  function changeTab(value: AccountTab) {
    setParams(previous => {
      const updated = new URLSearchParams(previous);
      updated.delete('status');
      if (value === 'permissions') updated.set('tab', value);
      else updated.delete('tab');
      return updated;
    }, { replace: true });
  }

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextTab = event.key === 'Home' ? 'profile' : event.key === 'End' ? 'permissions' : tab === 'profile' ? 'permissions' : 'profile';
    changeTab(nextTab);
    document.getElementById('admin-tab-' + nextTab)?.focus();
  }

  function showStatusConfirmation() {
    setParams(previous => {
      const updated = new URLSearchParams(previous);
      updated.set('tab', 'permissions');
      updated.set('status', next);
      return updated;
    }, { replace: true });
  }

  function onSaved(updated: Row, text: string) {
    setSaved({ id, row: updated, previous: detail.data, text });
    detail.refresh();
  }

  return <section className="admin-account-detail record-detail-page">
    <Link className="booking-back" to={back}><ArrowLeft size={17} aria-hidden="true" />Về danh sách tài khoản</Link>
    <PageHeader title={first(row ?? {}, 'fullName') || 'Thông tin tài khoản'}
      status={row && <Status value={row.accountStatus} />}
      meta={row && <><span>{first(row, 'email')}</span><AccountRole value={row.role} /></>}>
      <button type="button" className="button-secondary" disabled={detail.loading || detail.refreshing || editingId === id} onClick={detail.refresh}>
        <RefreshCw size={16} aria-hidden="true" />Làm mới
      </button>
    </PageHeader>
    {saved?.id === id && <p className="portal-success" role="status">{saved.text}</p>}
    <LoadState loading={detail.loading} error={detail.error} retry={detail.refresh} />
    {row && <>
      <div className="admin-account-tabs" role="tablist" aria-label="Chi tiết tài khoản">
        {tabs.map(({ id: value, label }) => <button key={value} type="button" role="tab" id={'admin-tab-' + value}
          aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} aria-controls={'admin-panel-' + value}
          onKeyDown={onTabKey} onClick={() => changeTab(value)}>{label}</button>)}
      </div>

      <div role="tabpanel" id="admin-panel-profile" aria-labelledby="admin-tab-profile" hidden={tab !== 'profile'}>
        <section className="manager-section admin-detail-panel">
          <div className="admin-detail-heading">
            <h2>Hồ sơ tài khoản</h2>
            {editingId !== id && <button type="button" className="button-secondary" disabled={detail.refreshing} onClick={() => setEditingId(id)}>
              <Pencil size={16} aria-hidden="true" />Chỉnh sửa
            </button>}
          </div>
          {editingId === id && <ProfileEditor key={id} path={path} row={row} onCancel={() => setEditingId('')} onSave={updated => {
            setEditingId('');
            onSaved(updated, 'Đã lưu thông tin tài khoản.');
          }} />}
          <Facts items={[
            ...(editingId === id ? [] : [
              ['Số điện thoại', first(row, 'phone') || 'Chưa cập nhật'],
            ] as [string, string][]),
            ['Ngày tạo', date(row.createdAt, true)],
          ]} />
          {first(row, 'updatedAt') && <DetailDisclosure title="Lịch sử cập nhật"><Facts items={[[ 'Cập nhật gần nhất', date(row.updatedAt, true) ]]} /></DetailDisclosure>}
        </section>
      </div>

      <div role="tabpanel" id="admin-panel-permissions" aria-labelledby="admin-tab-permissions" hidden={tab !== 'permissions'}>
        <section className="manager-section admin-detail-panel">
          <AccountRoleAccess value={row.role} />
          <div className="admin-access-status">
            <h3>Trạng thái truy cập</h3><Status value={row.accountStatus} />
            {id === user?.id ? <p>Bạn đang dùng tài khoản này.</p> : canChange && <>
              <p>{next === 'DISABLED'
                ? 'Tài khoản sẽ bị chặn đăng nhập và các yêu cầu từ phiên đang mở.'
                : 'Người dùng có thể đăng nhập lại để tiếp tục.'}</p>
              <button type="button" disabled={detail.refreshing} className={next === 'DISABLED' ? 'button-secondary portal-danger' : 'button-primary'}
                onClick={showStatusConfirmation}>{next === 'DISABLED' ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}</button>
            </>}
          </div>
        </section>
      </div>
      {canChange && status === next && <StatusConfirmation key={id + ':' + next}
        path={path} name={first(row, 'fullName')} next={next} onClose={() => changeTab('permissions')} onSaved={updated => {
          changeTab('permissions');
          onSaved(updated, next === 'DISABLED' ? 'Đã khóa tài khoản.' : 'Đã mở khóa tài khoản.');
        }} />}
    </>}
  </section>;
}

function ProfileEditor({ path, row, onCancel, onSave }: {
  path: string; row: Row; onCancel: () => void; onSave: (updated: Row) => void;
}) {
  const [initial] = useState(() => ({ fullName: first(row, 'fullName'), phone: first(row, 'phone') }));
  const [fullName, setFullName] = useState(initial.fullName);
  const [phone, setPhone] = useState(initial.phone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const name = fullName.trim(), number = phone.trim();
  const nameChanged = name !== initial.fullName;
  const phoneChanged = number !== initial.phone;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || (!nameChanged && !phoneChanged)) return;
    if (nameChanged && (name.length < 2 || name.length > 120)) {
      setError('Họ và tên phải có 2–120 ký tự.');
      return;
    }
    const digits = number.replace(/\D/g, '').length;
    if (phoneChanged && (!/^\+?[\d\s().-]{8,25}$/.test(number) || digits < 8 || digits > 15)) {
      setError('Số điện thoại phải có 8–15 chữ số.');
      return;
    }
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      onSave(await mutate(path, 'PATCH', { ...(nameChanged ? { fullName: name } : {}), ...(phoneChanged ? { phone: number } : {}) }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể lưu thông tin tài khoản.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return <form className="portal-form admin-profile-editor" onSubmit={submit}>
    <label>Họ và tên<input required maxLength={120} value={fullName} autoComplete="name" disabled={busy} onChange={event => setFullName(event.target.value)} /></label>
    <label>Số điện thoại<input type="tel" maxLength={25} value={phone} autoComplete="tel" disabled={busy} onChange={event => setPhone(event.target.value)} /></label>
    {error && <p className="booking-alert is-error" role="alert">{error}</p>}
    <div className="portal-actions">
      <button type="submit" className="button-primary" disabled={busy || (!nameChanged && !phoneChanged)}>{busy ? 'Đang lưu…' : 'Lưu'}</button>
      <button type="button" className="button-secondary" disabled={busy} onClick={onCancel}>Hủy</button>
    </div>
  </form>;
}

function StatusConfirmation({ path, name, next, onClose, onSaved }: {
  path: string; name: string; next: 'ACTIVE' | 'DISABLED'; onClose: () => void; onSaved: (updated: Row) => void;
}) {
  const formId = useId();
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const disable = next === 'DISABLED';
  return <Modal title={disable ? 'Xác nhận khóa tài khoản' : 'Xác nhận mở khóa tài khoản'} busy={busy} onClose={onClose} footer={<>
        <button type="button" className="button-secondary" disabled={busy} onClick={onClose}>Hủy</button>
        <button type="submit" form={formId} className={disable ? 'button-secondary portal-danger' : 'button-primary'} disabled={!confirmed || busy}>
          {busy ? 'Đang lưu…' : disable ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
        </button>
    </>}>
    <form id={formId} className="portal-form" onSubmit={async event => {
      event.preventDefault();
      if (!confirmed || lock.current) return;
      lock.current = true;
      setBusy(true);
      setError('');
      try { onSaved(await mutate(path + '/status', 'PATCH', { accountStatus: next })); }
      catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể cập nhật trạng thái.'); }
      finally { lock.current = false; setBusy(false); }
    }}>
      <p><strong>{name}</strong> · {disable ? 'Các yêu cầu từ phiên đang mở sẽ bị từ chối. Hồ sơ của tài khoản vẫn được lưu.' : 'Người dùng cần đăng nhập lại để truy cập.'}</p>
      <label className="portal-checkbox"><input type="checkbox" required checked={confirmed} disabled={busy}
        onChange={event => setConfirmed(event.target.checked)} />Tôi xác nhận thay đổi quyền truy cập</label>
      {error && <p className="booking-alert is-error" role="alert">{error}</p>}
    </form>
  </Modal>;
}
