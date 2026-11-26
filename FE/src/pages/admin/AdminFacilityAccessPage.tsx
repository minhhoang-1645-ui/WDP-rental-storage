import { Building2, Plus, RefreshCw, Search } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
import { mutate } from '../../services/portal';
import { date } from '../../components/manager/portal-data';
import { Empty, LoadState, Modal, PageHeader, Pagination, RefreshStatus, Status } from '../../components/manager/PortalUi';
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
  const counts = new Map<string, number>();
  for (const grant of directory.data?.items ?? []) {
    if (!grant.revokedAt) counts.set(grant.userId, (counts.get(grant.userId) ?? 0) + 1);
  }
  const currentPage = Math.min(page, Math.max(1, Math.ceil(accounts.length / limit)));
  const visible = accounts.slice((currentPage - 1) * limit, currentPage * limit);
  return <section className="admin-facility-access">
    <PageHeader title="Quyền truy cập cơ sở" description="Xem và quản lý quyền của nhân viên và quản lý cơ sở.">
      <button type="button" className="button-secondary" onClick={directory.refresh} disabled={directory.loading || directory.refreshing}><RefreshCw size={16} aria-hidden="true" />Làm mới</button>
    </PageHeader>
    <RefreshStatus active={directory.refreshing} />
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
        const count = counts.get(account.id) ?? 0;
        return <li key={account.id}><button type="button" aria-pressed={chosen?.id === account.id}
          onClick={() => setParams(previous => {
            const next = new URLSearchParams(previous);
            next.set('user', account.id);
            return next;
          }, { replace: true })}>
          <AdminAvatar name={account.fullName} />
          <span className="admin-facility-person"><strong>{account.fullName}</strong><small>{account.email}</small>
            <span className="admin-facility-person-meta"><AccountRole value={account.role} />
              <Status value={account.accountStatus} text={account.accountStatus ? undefined : 'Chưa xác minh'} />
            </span>
            <small>{count} cơ sở còn quyền truy cập</small>
          </span>
        </button></li>;
      })}</ul> : <Empty title="Không tìm thấy tài khoản" description="Thử tìm theo tên hoặc email khác." />}
      {accounts.length > limit && <Pagination page={currentPage} limit={limit} total={accounts.length} onChange={setPage} />}
      </section>
      {chosen ? <FacilityAccessDetail key={chosen.id} account={chosen} directory={directory.data} directoryRefreshing={directory.refreshing} onChanged={directory.refresh} /> : <div className="manager-section admin-facility-placeholder">
        <Building2 size={27} aria-hidden="true" />
        <h2>Chọn một tài khoản</h2>
        <p>Chọn nhân viên hoặc quản lý để xem quyền tại từng cơ sở.</p>
      </div>}
    </div>}
  </section>;
}

const tabs = [['current', 'Quyền hiện tại'], ['history', 'Lịch sử cấp và thu hồi']] as const;
type AccessTab = typeof tabs[number][0];

function FacilityAccessDetail({ account, directory, directoryRefreshing, onChanged }: {
  account: Account; directory: Directory; directoryRefreshing: boolean; onChanged: () => void;
}) {
  const { user } = useAuth();
  const data = useApiResource<AccountAccess>(accessPath(account.id), user?.id, true);
  const directoryOnly = data.status === 404 && data.error.startsWith('Cannot GET ');
  const profile = useApiResource<Account>(!account.accountStatus ? '/admin/users/' + encodeURIComponent(account.id) : null, user?.id);
  const status = account.accountStatus ?? profile.data?.accountStatus;
  const ready = Boolean(data.data || directoryOnly);
  const refreshing = data.refreshing || directoryRefreshing || profile.loading || profile.refreshing;
  const [tab, setTab] = useState<AccessTab>('current');
  const [historyPage, setHistoryPage] = useState(1);
  const [granting, setGranting] = useState(false);
  const [revoke, setRevoke] = useState<Grant>();
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const revokeLock = useRef(false);
  const grants = directoryOnly ? directory.items.filter(item => item.userId === account.id) : data.data?.history ?? [];
  const history = [...grants].sort((a, b) => Date.parse(b.grantedAt) - Date.parse(a.grantedAt) || b.id.localeCompare(a.id));
  const active = history.filter(grant => !grant.revokedAt);
  const activeIds = new Set(active.map(grant => grant.facilityId));
  const codes = new Map(directory.facilities.map(facility => [facility.id, facility.code]));
  const historyLimit = 10;
  const page = Math.min(historyPage, Math.max(1, Math.ceil(history.length / historyLimit)));
  const canGrant = status === 'ACTIVE' && directory.facilities.length > 0;

  function refresh() {
    onChanged();
    if (!directoryOnly) data.refresh();
    if (!account.accountStatus) profile.refresh();
  }

  function moveTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
      : event.key === 'ArrowRight' ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length : -1;
    if (target < 0) return;
    event.preventDefault();
    const next = tabs[target][0];
    setTab(next);
    document.getElementById('facility-access-tab-' + next)?.focus();
  }

  async function confirmRevoke() {
    if (!revoke || revokeLock.current || refreshing) return;
    revokeLock.current = true;
    setRevoking(true);
    setError('');
    setNotice('');
    try {
      await mutate(path + '/' + encodeURIComponent(revoke.id) + '/revoke', 'PATCH', {});
      setNotice('Đã thu hồi quyền tại ' + revoke.facility.name + '.');
      setRevoke(undefined);
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Chưa thu hồi được quyền.');
    } finally {
      revokeLock.current = false;
      setRevoking(false);
    }
  }

  function facilityCell(grant: Grant) {
    return <><strong>{grant.facility.name}</strong>{codes.get(grant.facilityId) && <small>{codes.get(grant.facilityId)}</small>}</>;
  }

  return <section className="manager-section admin-facility-detail">
    <header className="admin-detail-heading admin-facility-account">
      <div className="admin-detail-identity">
        <AdminAvatar name={account.fullName} large />
        <div><h2>{account.fullName}</h2>{account.email && <p>{account.email}</p>}
          <div className="admin-detail-meta"><AccountRole value={account.role} />
            <Status value={status} text={status ? undefined : 'Chưa xác minh'} />
          </div>
        </div>
      </div>
      <Link className="button-secondary" to={'/admin/users/' + encodeURIComponent(account.id) + '?tab=permissions'}>Xem hồ sơ tài khoản</Link>
    </header>
    <LoadState loading={data.loading || profile.loading} error={directoryOnly ? profile.error : data.error || profile.error}
      retry={directoryOnly || profile.error ? profile.refresh : data.refresh} />
    {notice && <p className="portal-success" role="status">{notice}</p>}
    {ready && <>
      <div className="admin-account-tabs" role="tablist" aria-label="Quyền cơ sở của tài khoản">
        {tabs.map(([value, label], index) => <button key={value} type="button" role="tab" id={'facility-access-tab-' + value}
          aria-selected={tab === value} aria-controls={'facility-access-panel-' + value} tabIndex={tab === value ? 0 : -1}
          onClick={() => setTab(value)} onKeyDown={event => moveTab(event, index)}>{label}</button>)}
      </div>
      <div role="tabpanel" id="facility-access-panel-current" aria-labelledby="facility-access-tab-current" hidden={tab !== 'current'}>
        <div className="admin-detail-heading"><h3>Cơ sở được cấp quyền</h3>
          {canGrant && <button type="button" className="button-primary" disabled={refreshing}
            onClick={() => { setGranting(true); setNotice(''); }}><Plus size={17} aria-hidden="true" />Cấp quyền</button>}
        </div>
        {!profile.loading && status !== 'ACTIVE' && <p className="admin-facility-muted">
          {status === 'DISABLED' ? 'Mở khóa tài khoản trước khi cấp thêm quyền.' : 'Chưa xác minh được trạng thái tài khoản để cấp quyền.'}
        </p>}
        {active.length ? <div className="manager-table-wrap admin-facility-table">
          <table className="manager-table" aria-label="Cơ sở đang được cấp quyền">
            <thead><tr><th scope="col">Cơ sở</th><th scope="col">Cấp quyền (UTC+7)</th><th scope="col">Thao tác</th></tr></thead>
            <tbody>{active.map(grant => <tr key={grant.id}>
              <td>{facilityCell(grant)}</td><td>{date(grant.grantedAt, true)}</td>
              <td><button type="button" className="button-secondary" disabled={refreshing}
                aria-label={'Thu hồi quyền tại ' + grant.facility.name}
                onClick={() => { setError(''); setRevoke(grant); }}>Thu hồi</button></td>
            </tr>)}</tbody>
          </table>
        </div> : <Empty title="Chưa được cấp quyền tại cơ sở nào" description={canGrant ? 'Chọn Cấp quyền để thêm cơ sở.' : ''} />}
      </div>
      <div role="tabpanel" id="facility-access-panel-history" aria-labelledby="facility-access-tab-history" hidden={tab !== 'history'}>
        {directoryOnly ? <p className="admin-facility-muted">API hiện chỉ cung cấp quyền đang có hiệu lực.</p> : history.length ? <>
          <div className="manager-table-wrap admin-facility-table admin-facility-history">
            <table className="manager-table" aria-label="Lịch sử cấp và thu hồi">
              <thead><tr><th scope="col">Cơ sở</th><th scope="col">Cấp quyền (UTC+7)</th>
                <th scope="col">Thu hồi (UTC+7)</th><th scope="col">Trạng thái</th></tr></thead>
              <tbody>{history.slice((page - 1) * historyLimit, page * historyLimit).map(grant => <tr key={grant.id}>
                <td>{facilityCell(grant)}</td>
                <td>{date(grant.grantedAt, true)}<small>{grant.grantedByName || grant.grantedById || 'Chưa ghi nhận'}</small></td>
                <td>{grant.revokedAt ? <>{date(grant.revokedAt, true)}<small>{grant.revokedByName || grant.revokedById || 'Chưa ghi nhận'}</small></> : '—'}</td>
                <td><Status value={grant.revokedAt ? 'REVOKED' : 'ACTIVE'} text={grant.revokedAt ? 'Đã thu hồi' : 'Còn hiệu lực'} /></td>
              </tr>)}</tbody>
            </table>
          </div>
          {history.length > historyLimit && <Pagination page={page} limit={historyLimit} total={history.length} onChange={setHistoryPage} />}
        </> : <Empty title="Chưa có lịch sử cấp và thu hồi" description="" />}
      </div>
    </>}
    {granting && <GrantFacilityAccess account={account} facilities={directory.facilities} active={activeIds}
      disabled={!ready || !canGrant || refreshing} onClose={() => setGranting(false)} onChanged={refresh}
      onComplete={count => { setNotice('Đã cấp quyền tại ' + count + ' cơ sở.'); setGranting(false); }} />}
    {revoke && <Modal title="Xác nhận thu hồi quyền cơ sở" className="admin-facility-access-modal" busy={revoking}
      onClose={() => setRevoke(undefined)} footer={<>
        <button type="button" className="button-secondary" disabled={revoking} onClick={() => setRevoke(undefined)}>Hủy</button>
        <button type="button" className="button-secondary portal-danger" disabled={revoking || refreshing}
          onClick={() => void confirmRevoke()}>{revoking ? 'Đang thu hồi…' : 'Thu hồi quyền'}</button>
      </>}>
      <dl className="admin-permission-facts">
        <div><dt>Tài khoản</dt><dd>{account.fullName}</dd></div>
        <div><dt>Cơ sở</dt><dd>{revoke.facility.name}{codes.get(revoke.facilityId) && ' · ' + codes.get(revoke.facilityId)}</dd></div>
      </dl>
      <p>Tài khoản mất quyền tại cơ sở này và phải đăng nhập lại. Công việc và ca làm đã xếp cần được xử lý theo quy trình hiện hành.</p>
      {error && <p role="alert" className="booking-alert is-error">{error}</p>}
    </Modal>}
  </section>;
}

function GrantFacilityAccess({ account, facilities, active, disabled, onClose, onChanged, onComplete }: {
  account: Account; facilities: Facility[]; active: Set<string>; disabled: boolean;
  onClose: () => void; onChanged: () => void; onComplete: (count: number) => void;
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [granted, setGranted] = useState<string[]>([]);
  const [failures, setFailures] = useState<{ facility: Facility; message: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const alreadyGranted = (id: string) => active.has(id) || granted.includes(id);
  const eligible = facilities.filter(facility => !alreadyGranted(facility.id));
  const targets = eligible.filter(facility => selected.includes(facility.id));
  const visible = facilities.filter(facility => (facility.name + ' ' + facility.code).toLocaleLowerCase('vi-VN')
    .includes(search.trim().toLocaleLowerCase('vi-VN')));

  async function submit() {
    if (lock.current || disabled || !targets.length) return;
    lock.current = true;
    setBusy(true);
    const completed: string[] = [];
    const failed: typeof failures = [];
    try {
      for (const facility of targets) {
        try {
          await mutate(path, 'POST', { userId: account.id, facilityId: facility.id });
          completed.push(facility.id);
        } catch (caught) {
          failed.push({ facility, message: caught instanceof Error ? caught.message : 'Chưa cấp được quyền.' });
        }
      }
      setGranted([...granted, ...completed]);
      setSelected(previous => previous.filter(id => !completed.includes(id)));
      const remainingFailures = [...failures.filter(item => !targets.some(facility => facility.id === item.facility.id)), ...failed];
      setFailures(remainingFailures);
      if (completed.length) onChanged();
      if (!remainingFailures.length) {
        onComplete(granted.length + completed.length);
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return <Modal title="Cấp quyền cơ sở" className="admin-facility-access-modal" busy={busy} onClose={onClose} footer={<>
    <span className="admin-facility-selection" role="status">Đã chọn {targets.length} cơ sở</span>
    <button type="button" className="button-secondary" disabled={busy} onClick={onClose}>{granted.length ? 'Đóng' : 'Hủy'}</button>
    <button type="button" className="button-primary" disabled={busy || disabled || !targets.length}
      onClick={() => void submit()}>{busy ? 'Đang cấp quyền…' : 'Cấp quyền'}</button>
  </>}>
    <div className="admin-facility-modal-account"><AdminAvatar name={account.fullName} />
      <div><strong>{account.fullName}</strong><small>{account.email}</small></div>
    </div>
    <label className="field-label">Tìm cơ sở
      <span className="admin-facility-search"><Search size={16} aria-hidden="true" />
        <input type="search" value={search} placeholder="Tên hoặc mã cơ sở" onChange={event => setSearch(event.target.value)} />
      </span>
    </label>
    {!eligible.length && <p role="status">Tài khoản đã được cấp quyền tại tất cả cơ sở trong danh mục.</p>}
    {!visible.length ? <p>Không tìm thấy cơ sở phù hợp.</p> : <ul className="admin-facility-options">
      {visible.map(facility => {
        const existing = alreadyGranted(facility.id);
        return <li key={facility.id}><label>
          <input type="checkbox" checked={existing || selected.includes(facility.id)} disabled={existing || busy || disabled}
            onChange={event => {
              const checked = event.target.checked;
              setSelected(previous => checked ? [...previous, facility.id] : previous.filter(id => id !== facility.id));
            }} />
          <span><strong>{facility.name}</strong><small>{facility.code}</small></span>
          {existing && <Status value="ACTIVE" text="Đã cấp quyền" />}
        </label></li>;
      })}
    </ul>}
    {!!granted.length && <p className="portal-success" role="status">
      Đã cấp quyền tại {facilities.filter(facility => granted.includes(facility.id)).map(facility => facility.name).join(', ')}.
    </p>}
    {!!failures.length && <div className="booking-alert is-error" role="alert"><strong>Chưa cấp được quyền</strong>
      <ul>{failures.map(({ facility, message }) => <li key={facility.id}>{facility.name} · {message}</li>)}</ul>
    </div>}
  </Modal>;
}
