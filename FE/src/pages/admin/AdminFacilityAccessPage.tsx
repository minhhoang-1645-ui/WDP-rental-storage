import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
import { mutate } from '../../services/portal';
import { date } from '../../components/manager/portal-data';
import { Empty, LoadState, Modal, PageHeader, Pagination, Status } from '../../components/manager/PortalUi';
import { AdminAvatar } from './AdminAvatar';
import { AccountRole } from './AccountRole';

const path = '/admin/facility-access';
type Facility = { id: string; name: string; code: string };
type Account = { id: string; fullName: string; email?: string; role: string; accountStatus?: string };
type Grant = { id: string; facilityId: string; facility: { name: string }; grantedAt: string; revokedAt: string | null; grantedById: string; revokedById: string | null; grantedByName?: string | null; revokedByName?: string | null };
type Directory = { facilities: Facility[]; users: Account[]; items: (Grant & { userId: string })[] };
export type AccountAccess = {
  sessionManagement?: boolean;
  history: Grant[];
  openAssignments: number;
  closedAssignments: number;
  sessions: { expiresAt: string; status: 'ACTIVE' | 'REVOKED' }[];
};

export const accessPath = (id: string) => '/admin/users/' + encodeURIComponent(id) + '/access';

export function AssignmentImpact({ access }: { access?: AccountAccess | null }) {
  if (!access) return <p>Chưa có số liệu phân công. Backend kiểm tra điều kiện trước khi thay đổi quyền.</p>;
  return <p>Công việc được giao trên toàn hệ thống: <strong>{access.openAssignments}</strong> đang mở · <strong>{access.closedAssignments}</strong> đã đóng.
    {access.openAssignments > 0 && ' Việc chuyển giao nhiệm vụ thuộc quyền Quản lý cơ sở.'}</p>;
}

export function AdminFacilityAccessPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const limit = 15;
  const directory = useApiResource<Directory>(path + '?view=directory', user?.id, true);
  const chosen = directory.data?.users.find(item => item.id === params.get('user'));
  const phrase = search.trim().toLocaleLowerCase('vi-VN');
  const accounts = directory.data?.users.filter(item => (!role || item.role === role) && (!status || item.accountStatus === status) && (item.fullName + ' ' + (item.email ?? '')).toLocaleLowerCase('vi-VN').includes(phrase)) ?? [];
  const currentPage = Math.min(page, Math.max(1, Math.ceil(accounts.length / limit)));
  const visible = accounts.slice((currentPage - 1) * limit, currentPage * limit);
  return <section>
    <PageHeader title="Quyền truy cập cơ sở" description="Xem và quản lý quyền của nhân viên và quản lý cơ sở.">
      <button type="button" className="button-secondary" onClick={directory.refresh} disabled={directory.loading || directory.refreshing}>Làm mới</button>
    </PageHeader>
    <LoadState loading={directory.loading} error={directory.error} retry={directory.refresh} />
    {directory.data && <div className="admin-facility-grid"><section className="manager-section admin-facility-directory">
      <h2>Tài khoản cơ sở</h2>
      <label className="field-label portal-search">Tìm tài khoản
        <input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Tên hoặc email" />
      </label>
      <div className="admin-directory-filters">
        <label className="field-label">Vai trò<select value={role} onChange={event => { setRole(event.target.value); setPage(1); }}>
          <option value="">Tất cả</option><option value="FACILITY_MANAGER">Quản lý cơ sở</option><option value="FACILITY_STAFF">Nhân viên cơ sở</option>
        </select></label>
        <label className="field-label">Trạng thái<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
          <option value="">Tất cả</option><option value="ACTIVE">Đang hoạt động</option><option value="DISABLED">Đã khóa</option>
        </select></label>
      </div>
      {accounts.length ? <ul className="admin-facility-people">{visible.map(account => {
        const count = directory.data?.items.filter(item => item.userId === account.id).length ?? 0;
        return <li key={account.id}><button type="button" aria-pressed={chosen?.id === account.id}
          onClick={() => setParams({ user: account.id }, { replace: true })}>
          <AdminAvatar name={account.fullName} />
          <span className="admin-facility-person"><strong>{account.fullName}</strong><small>{account.email}</small>
            <AccountRole value={account.role} /><small>{count} cơ sở đã cấp</small></span>
          <Status value={account.accountStatus} text={account.accountStatus ? undefined : 'Chưa xác minh'} />
        </button></li>;
      })}</ul> : <Empty title="Không tìm thấy tài khoản" description="Thử tìm theo tên hoặc email khác." />}
      {accounts.length > limit && <Pagination page={currentPage} limit={limit} total={accounts.length} onChange={setPage} />}
      </section>
      {chosen ? <FacilityAccessDetail key={chosen.id} account={chosen} directory={directory.data} directoryRefreshing={directory.refreshing} onChanged={directory.refresh} /> : <Empty title="Chọn một tài khoản" description="Chọn nhân viên hoặc quản lý để xem quyền tại từng cơ sở." />}
    </div>}
  </section>;
}

function FacilityAccessDetail({ account, directory, directoryRefreshing, onChanged }: {
  account: Account; directory: Directory; directoryRefreshing: boolean; onChanged: () => void;
}) {
  const { user } = useAuth();
  const data = useApiResource<AccountAccess>(accessPath(account.id), user?.id, true);
  const directoryOnly = data.status === 404 && data.error.startsWith('Cannot GET ');
  const profile = useApiResource<Account>(directoryOnly && !account.accountStatus
    ? '/admin/users/' + encodeURIComponent(account.id) : null, user?.id);
  const accountStatus = profile.data?.accountStatus ?? account.accountStatus;
  const { facilities } = directory;
  const grants = directoryOnly ? directory.items.filter(item => item.userId === account.id) : data.data?.history ?? [];
  const ready = Boolean(data.data || directoryOnly);
  const refreshing = data.refreshing || directoryRefreshing || profile.loading || profile.refreshing;
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmGrant, setConfirmGrant] = useState(false);
  const [revoke, setRevoke] = useState<Grant>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  const active = new Map<string, Grant>(grants.filter(item => !item.revokedAt).map(item => [item.facilityId, item] as const));
  const toGrant = facilities.filter(item => selected.includes(item.id) && !active.has(item.id));

  async function save() {
    if (lock.current || !ready || refreshing || (!revoke && (accountStatus !== 'ACTIVE' || !toGrant.length))) return;
    lock.current = true;
    setBusy(true);
    setNotice('');
    setError('');
    try {
      if (revoke) {
        await mutate(path + '/' + encodeURIComponent(revoke.id) + '/revoke', 'PATCH', {});
        setNotice('Đã thu hồi quyền tại ' + revoke.facility.name + '.');
        setRevoke(undefined);
      } else {
        const failures: string[] = [];
        const completed: string[] = [];
        for (const facility of toGrant) {
          try {
            await mutate(path, 'POST', { userId: account.id, facilityId: facility.id });
            completed.push(facility.id);
          } catch (caught) {
            failures.push(facility.name + ' · ' + (caught instanceof Error ? caught.message : 'Chưa cấp được quyền.'));
          }
        }
        if (completed.length) {
          setConfirmGrant(false);
          setNotice('Đã xác nhận quyền tại ' + completed.length + ' cơ sở.');
        }
        setSelected(previous => previous.filter(id => !completed.includes(id)));
        setError(failures.join(' | '));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Chưa cập nhật được quyền.');
    } finally {
      lock.current = false;
      setBusy(false);
      onChanged();
      if (!directoryOnly) data.refresh();
      if (directoryOnly && !account.accountStatus) profile.refresh();
    }
  }

  return <section className="manager-section admin-detail-panel">
    <h2>Quyền của {account.fullName}</h2>
    <Link to={'/admin/users/' + encodeURIComponent(account.id) + '?tab=permissions'}>Mở hồ sơ tài khoản</Link>
    <LoadState loading={data.loading} error={directoryOnly ? profile.error : data.error} retry={directoryOnly ? profile.refresh : data.refresh} />
    {notice && <p className="portal-success" role="status">{notice}</p>}
    {error && !revoke && !confirmGrant && <p className="booking-alert is-error" role="alert">{error}</p>}
    {ready && <>
      <AssignmentImpact access={data.data} />
      {accountStatus === 'DISABLED' && <p>Tài khoản đang bị khóa. Chỉ có thể cấp quyền sau khi mở khóa.</p>}
      {!profile.loading && !['ACTIVE', 'DISABLED'].includes(accountStatus ?? '') && <p role="alert">Chưa xác minh được trạng thái tài khoản. Hãy làm mới danh sách trước khi cấp quyền.</p>}
      <div className="manager-table-wrap"><table className="manager-table">
        <thead><tr><th>Cơ sở</th><th>Quyền</th><th>Thao tác</th></tr></thead>
        <tbody>{facilities.map(facility => {
          const grant = active.get(facility.id);
          const revoked = data.data?.history.some(item => item.facilityId === facility.id && item.revokedAt);
          return <tr key={facility.id}>
            <td>{facility.name}<small>{facility.code}</small></td>
            <td>{grant ? 'Đã cấp' : revoked ? 'Đã thu hồi' : 'Chưa cấp'}</td>
            <td>{grant ? <button type="button" className="button-secondary portal-danger" disabled={busy || refreshing}
              onClick={() => { setError(''); setRevoke(grant); }}>Thu hồi</button>
              : <label className="portal-checkbox"><input type="checkbox" checked={selected.includes(facility.id)}
                disabled={busy || refreshing || accountStatus !== 'ACTIVE'} onChange={event => {
                  const checked = event.target.checked;
                  setSelected(previous => checked ? [...previous, facility.id] : previous.filter(id => id !== facility.id));
                }} />Chọn cấp quyền tại {facility.name}</label>}</td>
          </tr>;
        })}</tbody>
      </table></div>
      {!facilities.length && <Empty title="Chưa có cơ sở" description="Danh mục hệ thống chưa có cơ sở để cấp quyền." />}
      <button type="button" className="button-primary" disabled={busy || refreshing || !toGrant.length || accountStatus !== 'ACTIVE'}
        onClick={() => { setError(''); setConfirmGrant(true); }}>{busy && !revoke ? 'Đang cấp quyền…' : 'Cấp quyền cho cơ sở đã chọn'}</button>
      <h3>Lịch sử cấp và thu hồi</h3>
      {directoryOnly ? <p>Backend hiện chỉ cung cấp các quyền đang có hiệu lực.</p> : data.data?.history.length ? <div className="manager-table-wrap"><table className="manager-table">
        <thead><tr><th>Cơ sở</th><th>Cấp quyền</th><th>Thu hồi</th></tr></thead>
        <tbody>{data.data.history.map(item => <tr key={item.id}><td>{item.facility.name}</td>
          <td>{date(item.grantedAt, true)}<small>{item.grantedByName || item.grantedById}</small></td>
          <td>{item.revokedAt ? <>{date(item.revokedAt, true)}<small>{item.revokedByName || item.revokedById}</small></> : 'Còn hiệu lực'}</td></tr>)}</tbody>
      </table></div> : <p>Tài khoản chưa có lịch sử quyền cơ sở.</p>}
    </>}
    {confirmGrant && <Modal title="Xác nhận cấp quyền cơ sở" busy={busy} onClose={() => setConfirmGrant(false)} footer={<>
      <button type="button" className="button-secondary" disabled={busy} onClick={() => setConfirmGrant(false)}>Hủy</button>
      <button type="button" className="button-primary" disabled={busy || refreshing || !toGrant.length || accountStatus !== 'ACTIVE'}
        onClick={() => void save()}>{busy ? 'Đang cấp quyền…' : 'Xác nhận cấp quyền'}</button>
    </>}>
      <p><strong>{account.fullName}</strong> sẽ được cấp quyền tại các cơ sở đã chọn.</p>
      <ul>{toGrant.map(facility => <li key={facility.id}>{facility.name}</li>)}</ul>
      {error && <p className="booking-alert is-error" role="alert">{error}</p>}
    </Modal>}
    {revoke && <Modal title="Xác nhận thu hồi quyền cơ sở" busy={busy} onClose={() => setRevoke(undefined)} footer={<>
      <button type="button" className="button-secondary" disabled={busy} onClick={() => setRevoke(undefined)}>Hủy</button>
      <button type="button" className="button-secondary portal-danger" disabled={busy || refreshing || Boolean(data.data?.openAssignments)}
        onClick={() => void save()}>Thu hồi quyền</button>
    </>}>
      <p><strong>{account.fullName}</strong> sẽ mất quyền tại <strong>{revoke.facility.name}</strong> và phải đăng nhập lại.</p>
      <AssignmentImpact access={data.data} />
      {error && <p role="alert" className="booking-alert is-error">{error}</p>}
    </Modal>}
  </section>;
}
