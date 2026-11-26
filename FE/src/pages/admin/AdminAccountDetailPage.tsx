import { accessPath, type AccountAccess } from './AdminFacilityAccessPage';
import { AdminAccountSessions } from './AdminAccountSessions';
import { AdminAvatar } from './AdminAvatar';
import { AccountRoleEditor } from './AccountRoleEditor';
import { ArrowLeft, CircleCheck, History, Inbox, Lock, LockOpen, Mail, Pencil, RefreshCw, Settings, Warehouse } from 'lucide-react';
import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
import { mutate } from '../../services/portal';
import { date, first, type Row } from '../../components/manager/portal-data';
import { accountNameError, accountPhoneError } from './account-validation';
import { Facts, LoadState, Modal, Status } from '../../components/manager/PortalUi';
import { useInternalListReturn } from '../../components/workspace/internal-list-memory';
import { AccountRole, AccountRoleAccess } from './AccountRole';

const tabs = [
  { id: 'profile', label: 'Thông tin tài khoản' },
  { id: 'permissions', label: 'Phân quyền' },
  { id: 'sessions', label: 'Phiên đăng nhập' },
] as const;
type AccountTab = typeof tabs[number]['id'];

export function AdminAccountDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [editingId, setEditingId] = useState('');
  const [saved, setSaved] = useState<{ id: string; row: Row; previous: Row | null; text: string }>();
  const { state } = useLocation();
  const back = useInternalListReturn('/admin/users');
  const path = '/admin/users/' + encodeURIComponent(id);
  const detail = useApiResource<Row>(id && user?.id ? path : null, user?.id, false, true);
  const row = saved?.id === id && (!detail.data || saved.previous === detail.data) ? saved.row : detail.data;
  const status = params.get('status');
  const tab: AccountTab = status ? 'permissions' : tabs.find(item => item.id === params.get('tab'))?.id ?? 'profile';
  const access = useApiResource<AccountAccess>(id && user?.id && tab !== 'profile' ? accessPath(id) : null, user?.id, true);
  const facilityRole = row?.role === 'FACILITY_MANAGER' || row?.role === 'FACILITY_STAFF';
  const grants = access.data?.history.filter(grant => !grant.revokedAt) ?? [];
  const facilityAccessLink = '/admin/facility-access?user=' + encodeURIComponent(id);
  const historyLink = '/admin/permission-history?accountId=' + encodeURIComponent(id);
  const next = row?.accountStatus === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
  const canChange = Boolean(row && user?.id && id !== user.id && ['ACTIVE', 'DISABLED'].includes(String(row.accountStatus)));

  function changeTab(value: AccountTab) {
    setParams(previous => {
      const updated = new URLSearchParams(previous);
      updated.delete('status');
      if (value !== 'profile') updated.set('tab', value);
      else updated.delete('tab');
      return updated;
    }, { replace: true, state });
  }

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = tabs.findIndex(item => item.id === tab);
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
      : (index + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex].id;
    changeTab(nextTab);
    document.getElementById('admin-tab-' + nextTab)?.focus();
  }

  function showStatusConfirmation() {
    setParams(previous => {
      const updated = new URLSearchParams(previous);
      updated.set('tab', 'permissions');
      updated.set('status', next);
      return updated;
    }, { replace: true, state });
  }

  function onSaved(updated: Row, text: string) {
    setSaved({ id, row: updated, previous: detail.data, text });
    detail.refresh();
    access.refresh();
  }

  return <section className="admin-account-detail record-detail-page">
    <nav className="admin-account-crumb" aria-label="Đường dẫn tài khoản">
      <Link to={back}><ArrowLeft size={16} aria-hidden="true" />Quản lý tài khoản</Link>
      {row && <span aria-current="page">{first(row, 'fullName', 'email')}</span>}
    </nav>
    <header className="manager-page-header admin-detail-header">
      <div className="admin-account-heading">
        <div className="admin-account-title">
          <h1>{first(row ?? {}, 'fullName', 'email') || 'Thông tin tài khoản'}</h1>
          {row && <Status value={row.accountStatus} text={row.accountStatus === 'ACTIVE' ? 'Đang hoạt động' : undefined} />}
        </div>
        {row && <div className="admin-account-byline">
          <AdminAvatar name={first(row, 'fullName', 'email')} />
          <span><Mail size={16} aria-hidden="true" />{first(row, 'email')}</span>
          <AccountRole value={row.role} />
        </div>}
      </div>
      {tab !== 'sessions' && <button type="button" className="button-secondary"
        disabled={detail.loading || detail.refreshing || editingId === id} onClick={() => { detail.refresh(); access.refresh(); }}>
        <RefreshCw size={16} aria-hidden="true" />Làm mới
      </button>}
    </header>
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
          <Facts items={[
            ['Họ và tên', first(row, 'fullName') || 'Chưa cập nhật'], ['Email', first(row, 'email') || 'Chưa cập nhật'],
            ['Số điện thoại', first(row, 'phone') || 'Chưa cập nhật'], ['Vai trò', <AccountRole value={row.role} />],
            ['Ngày tạo', date(row.createdAt, true)], ['Cập nhật gần nhất', date(row.updatedAt, true)],
          ]} />
        </section>
      </div>

      <div role="tabpanel" id="admin-panel-permissions" aria-labelledby="admin-tab-permissions" hidden={tab !== 'permissions'}>
        <div className="admin-permission-grid">
          <div className="admin-permission-column">
            <section className="manager-section admin-permission-current">
              <AccountRoleAccess value={row.role} />
            </section>
            <section className="manager-section admin-permission-scope">
              <h2>{facilityRole ? 'Phạm vi cơ sở' : 'Phạm vi truy cập'}</h2>
              <div className="admin-scope-content">
                <div>
                  {facilityRole ? <>
                    <LoadState loading={access.loading} error={access.error} retry={access.refresh} />
                    {access.data && (grants.length ? <ul className="admin-grants-summary">
                      {grants.map(grant => <li key={grant.id}>
                        <span className="admin-permission-icon"><Warehouse size={23} aria-hidden="true" /></span>
                        <div><strong>{grant.facility.name}</strong><small>Cơ sở được cấp cho tài khoản</small></div>
                        <Status value="ACTIVE" text="Đang được cấp quyền" />
                      </li>)}
                    </ul> : <p>Chưa được cấp quyền tại cơ sở nào.</p>)}
                  </> : <p>Phạm vi truy cập được xác định theo vai trò hiện tại.</p>}
                </div>
                <div className="admin-scope-links">
                  {facilityRole && <Link to={facilityAccessLink}><Settings size={18} aria-hidden="true" />Quản lý quyền cơ sở</Link>}
                  <Link to={historyLink}><History size={18} aria-hidden="true" />Lịch sử thay đổi quyền</Link>
                </div>
              </div>
            </section>
          </div>
          <div className="admin-permission-column">
            {facilityRole && <section className="manager-section admin-permission-work">
              <h2>Công việc được giao</h2>
              <dl>
                <div><dt><Inbox size={17} aria-hidden="true" />Đang mở</dt><dd>{access.data?.openAssignments ?? '—'}</dd></div>
                <div><dt><CircleCheck size={17} aria-hidden="true" />Đã đóng</dt><dd>{access.data?.closedAssignments ?? '—'}</dd></div>
              </dl>
              <p>Thống kê công việc được giao trên hệ thống.</p>
            </section>}
            {id !== user?.id && <AccountRoleEditor key={id + ':' + String(row.role)} id={id} currentRole={String(row.role)} access={access.data}
              refreshing={detail.refreshing || access.loading || access.refreshing}
              onRefresh={() => { detail.refresh(); access.refresh(); }}
              onSaved={() => { detail.refresh(); access.refresh(); setSaved({ id, row, previous: detail.data, text: 'Đã đổi vai trò tài khoản.' }); }} />}
            <section className="manager-section admin-access-status">
              <h2>Bảo mật tài khoản</h2>
              {id === user?.id ? <p>Bạn đang dùng tài khoản này.</p> : canChange && <>
                <p>{next === 'DISABLED'
                  ? 'Khi khóa, người dùng không thể đăng nhập và các phiên còn hiệu lực sẽ kết thúc.'
                  : 'Khi mở khóa, người dùng có thể đăng nhập lại.'}</p>
                <button type="button" disabled={detail.refreshing || (next === 'DISABLED' && facilityRole && (access.loading || access.refreshing))}
                  className={next === 'DISABLED' ? 'button-secondary portal-danger' : 'button-primary'}
                  onClick={showStatusConfirmation}>{next === 'DISABLED' ? <Lock size={17} aria-hidden="true" /> : <LockOpen size={17} aria-hidden="true" />}{next === 'DISABLED' ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}</button>
              </>}
            </section>
          </div>
        </div>
      </div>
      <div role="tabpanel" id="admin-panel-sessions" aria-labelledby="admin-tab-sessions" hidden={tab !== 'sessions'}>
        {tab === 'sessions' && <AdminAccountSessions key={id} accountId={id} accountName={first(row, 'fullName', 'email')}
          adminId={user?.role === 'SYSTEM_ADMINISTRATOR' ? user.id : ''} access={access.data} accessLoading={access.loading}
          accessError={access.error} refreshAccess={access.refresh} />}
      </div>
      {editingId === id && tab === 'profile' && <ProfileEditor key={id} path={path} row={row} onCancel={() => setEditingId('')} onSave={updated => {
        setEditingId('');
        onSaved(updated, 'Đã lưu thông tin tài khoản.');
      }} />}
      {canChange && status === next && <StatusConfirmation key={id + ':' + next}
        path={path} name={first(row, 'fullName')} next={next} access={access.data} facilityRole={facilityRole}
        checking={facilityRole && (access.loading || access.refreshing)} onClose={() => changeTab('permissions')} onSaved={updated => {
          changeTab('permissions');
          onSaved(updated, next === 'DISABLED' ? 'Đã khóa tài khoản.' : 'Đã mở khóa tài khoản.');
        }} />}
    </>}
  </section>;
}

function ProfileEditor({ path, row, onCancel, onSave }: {
  path: string; row: Row; onCancel: () => void; onSave: (updated: Row) => void;
}) {
  const formId = useId();
  const [initial] = useState(() => ({ fullName: first(row, 'fullName').trim(), phone: first(row, 'phone').trim() }));
  const [fullName, setFullName] = useState(initial.fullName);
  const [phone, setPhone] = useState(initial.phone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const name = fullName.trim(), number = phone.trim();
  const nameChanged = name !== initial.fullName;
  const phoneChanged = number !== initial.phone;
  const nameError = nameChanged ? accountNameError(name) : '';
  const phoneError = phoneChanged ? accountPhoneError(number) : '';
  const allowed = (nameChanged || phoneChanged) && !nameError && !phoneError;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !allowed) return;
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

  return <Modal title="Chỉnh sửa tài khoản" className="admin-account-modal" onClose={onCancel} busy={busy} footer={<>
    <button type="button" className="button-secondary" disabled={busy} onClick={onCancel}>Hủy</button>
    <button type="submit" form={formId} className="button-primary" disabled={busy || !allowed}>{busy ? 'Đang lưu…' : 'Lưu thay đổi'}</button>
  </>}>
    <form id={formId} className="portal-form admin-profile-editor" noValidate onSubmit={submit}>
      <label className="field-label">Họ và tên<input name="fullName" maxLength={120} value={fullName} autoComplete="name" disabled={busy}
        aria-invalid={Boolean(nameError)} aria-describedby={nameError ? formId + '-name' : undefined} onChange={event => setFullName(event.target.value)} />
        {nameError && <small id={formId + '-name'} className="admin-field-error" role="alert">{nameError}</small>}
      </label>
      <label className="field-label">Số điện thoại<input name="phone" type="tel" maxLength={25} value={phone} autoComplete="tel" disabled={busy}
        aria-invalid={Boolean(phoneError)} aria-describedby={phoneError ? formId + '-phone' : undefined} onChange={event => setPhone(event.target.value)} />
        {phoneError && <small id={formId + '-phone'} className="admin-field-error" role="alert">{phoneError}</small>}
      </label>
      {error && <p className="booking-alert is-error" role="alert">{error}</p>}
    </form>
  </Modal>;
}

function StatusConfirmation({ path, name, next, access, facilityRole, checking, onClose, onSaved }: {
  path: string; name: string; next: 'ACTIVE' | 'DISABLED'; access: AccountAccess | null;
  facilityRole: boolean; checking: boolean; onClose: () => void; onSaved: (updated: Row) => void;
}) {
  const formId = useId();
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const disable = next === 'DISABLED';
  const blocked = disable && (checking || Boolean(access?.openAssignments));
  return <Modal title={disable ? 'Xác nhận khóa tài khoản' : 'Xác nhận mở khóa tài khoản'} busy={busy} onClose={onClose} footer={<>
        <button type="button" className="button-secondary" disabled={busy} onClick={onClose}>Hủy</button>
        <button type="submit" form={formId} className={disable ? 'button-secondary portal-danger' : 'button-primary'} disabled={!confirmed || busy || blocked}>
          {busy ? 'Đang lưu…' : disable ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
        </button>
    </>}>
    <form id={formId} className="portal-form" onSubmit={async event => {
      event.preventDefault();
      if (!confirmed || lock.current || blocked) return;
      lock.current = true;
      setBusy(true);
      setError('');
      try { onSaved(await mutate(path + '/status', 'PATCH', { accountStatus: next })); }
      catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể cập nhật trạng thái.'); }
      finally { lock.current = false; setBusy(false); }
    }}>
      <p><strong>{name}</strong> · {disable ? 'Các yêu cầu từ phiên đang mở sẽ bị từ chối. Hồ sơ của tài khoản vẫn được lưu.' : 'Người dùng cần đăng nhập lại để truy cập.'}</p>
      {disable && checking && <p role="status">Đang kiểm tra công việc cần chuyển giao…</p>}
      {disable && Boolean(access?.openAssignments) && <p role="alert">{facilityRole
        ? `Còn ${access?.openAssignments} công việc đang mở. Quản lý cơ sở cần chuyển giao trước khi khóa.`
        : 'Cần xử lý công việc đang mở trước khi khóa tài khoản.'}</p>}
      <label className="portal-checkbox"><input type="checkbox" required checked={confirmed} disabled={busy}
        onChange={event => setConfirmed(event.target.checked)} />Tôi xác nhận thay đổi quyền truy cập</label>
      {error && <p className="booking-alert is-error" role="alert">{error}</p>}
    </form>
  </Modal>;
}
