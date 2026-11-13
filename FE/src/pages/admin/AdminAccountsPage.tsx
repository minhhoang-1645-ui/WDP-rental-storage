import { Ellipsis, Eye, EyeOff, Plus, RefreshCw, UserRoundCheck, UserRoundX, X } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { AccountRole } from './AccountRole';
import { apiRequest } from '../../services/api';
import { safeLocalStorage } from '../../services/browser-storage';
import { AUTH_TOKEN_KEY } from '../../data/booking';
import { useAuth } from '../../auth/auth-context';
import { mutate } from '../../services/portal';
import { useInternalListResource } from '../../components/workspace/useInternalListResource';
import { InternalPagination } from '../../components/workspace/InternalPagination';
import { StaffTaskTable, TablePopover, type StaffColumn } from '../../components/workspace/StaffTaskTable';
import { date, first, label, type Row } from '../../components/manager/portal-data';
import { Empty, LoadState, Modal, PageHeader, Status } from '../../components/manager/PortalUi';

const sizes = [10, 20, 50] as const;
const roles = ['CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN'];
const statuses = { ACTIVE: 'Đang hoạt động', DISABLED: 'Đã vô hiệu hóa' };
type AccountStatus = keyof typeof statuses;
type BulkResult = { changed: number; skipped: number; failures: { id: string; name: string; reason: string }[] };

export function AdminAccountsPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [createdAccount, setCreatedAccount] = useState<Row>();
  const { key: locationKey } = useLocation();
  const [selection, setSelection] = useState<{ key: string; ids: Set<string> }>();
  const [bulk, setBulk] = useState<{ status: AccountStatus; rows: Row[]; skipped: number }>();
  const [result, setResult] = useState<BulkResult>();
  const sort = params.get('sort') ?? 'newest';
  const search = params.get('search') ?? '';
  const role = params.get('role') ?? '';
  const status = params.get('status') ?? '';
  const limit = sizes.find(size => size === Number(params.get('limit'))) ?? 20;
  const page = Math.max(1, Math.min(100000, Math.floor(Number(params.get('page')) || 1)));
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search.trim()) query.set('search', search.trim());
  if (sort !== 'newest') query.set('sort', sort);
  if (role) query.set('role', role);
  if (status) query.set('accountStatus', status);
  const data = useInternalListResource<Row>(`/admin/users?${query}`, user?.id ?? '', true);

  const rows = data.data?.items ?? [];
  const eligible = rows.filter(row => first(row, 'id') && row.id !== user?.id
    && (row.accountStatus === 'ACTIVE' || row.accountStatus === 'DISABLED'));
  const selectionKey = `${user?.id}:${locationKey}`;
  const selected = eligible.filter(row => selection?.key === selectionKey && selection.ids.has(first(row, 'id')));
  const selectedIds = new Set(selected.map(row => first(row, 'id')));
  const selectAll = useRef<HTMLInputElement>(null);
  const allChecked = eligible.length > 0 && selected.length === eligible.length;
  const someChecked = selected.length > 0 && !allChecked;
  useLayoutEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = someChecked;
  });

  function startBulk(status: AccountStatus) {
    const targets = selected.filter(row => row.accountStatus !== status);
    setResult(undefined);
    setBulk({ status, rows: targets, skipped: selected.length - targets.length });
  }

  function change(key: string, value: string) {
    setSelection(undefined);
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== 'page') next.delete('page');
      return next;
    }, { replace: true });
  }

  const columns: StaffColumn<Row>[] = [
    { key: 'selection', label: 'Chọn tài khoản', header: <input ref={selectAll} type="checkbox"
      aria-label="Chọn tất cả tài khoản đủ điều kiện trên trang" checked={allChecked} disabled={!eligible.length}
      onChange={event => setSelection({ key: selectionKey, ids: new Set(event.target.checked ? eligible.map(row => first(row, 'id')) : []) })} />,
      cell: row => {
        const id = first(row, 'id');
        return <input type="checkbox" aria-label={`Chọn ${first(row, 'email')}`} checked={selectedIds.has(id)}
          disabled={!eligible.includes(row)} onChange={event => {
            const ids = new Set(selectedIds);
            if (event.target.checked) ids.add(id);
            else ids.delete(id);
            setSelection({ key: selectionKey, ids });
          }} />;
      } },
    { key: 'account', label: 'Tài khoản', sort: { direction: sort === 'name-asc' ? 'ascending' : sort === 'name-desc' ? 'descending' : 'none', toggle: () => change('sort', sort === 'name-asc' ? 'name-desc' : 'name-asc') }, cell: row => <>
      <strong>{first(row, 'fullName')}</strong><small>{first(row, 'email')}</small>
      {row.id === user?.id && <small>Tài khoản của bạn</small>}
    </> },
    { key: 'role', label: 'Vai trò', cell: row => <AccountRole value={row.role} /> },
    { key: 'status', label: 'Trạng thái', cell: row => <Status value={row.accountStatus} /> },
    { key: 'date', label: 'Ngày tạo', optional: true, sort: { direction: sort === 'oldest' ? 'ascending' : sort === 'newest' ? 'descending' : 'none', toggle: () => change('sort', sort === 'oldest' ? 'newest' : 'oldest') }, cell: row => date(row.createdAt, true) },
    { key: 'actions', label: 'Thao tác', cell: row => {
      const id = first(row, 'id');
      const path = `/admin/users/${encodeURIComponent(id)}`;
      const active = row.accountStatus === 'ACTIVE';
      return <div className="staff-table-actions">
        <TablePopover name={`Thao tác tài khoản ${first(row, 'email', 'fullName')}`} trigger={<Ellipsis size={18} aria-hidden="true" />}>
          <Link to={path}>Xem chi tiết</Link>
          {eligible.includes(row) && <Link className={active ? 'admin-destructive-link' : undefined}
            to={`${path}?status=${active ? 'DISABLED' : 'ACTIVE'}`}>{active ? 'Vô hiệu hóa' : 'Kích hoạt lại'}</Link>}
        </TablePopover>
      </div>;
    } },
  ];

  return <section className="admin-accounts">
    <PageHeader title="Quản lý tài khoản">
      <button type="button" className="button-primary" onClick={() => setCreating(true)}><Plus size={17} />Tạo tài khoản</button>
      <button type="button" className="button-secondary" onClick={data.refresh} disabled={data.loading}><RefreshCw size={16} />Làm mới</button>
    </PageHeader>
    {createdAccount && <div className="portal-success admin-created" role="status">
      <span>Đã tạo tài khoản {first(createdAccount, 'fullName')}.</span>
      {first(createdAccount, 'id') && <Link to={`/admin/users/${encodeURIComponent(first(createdAccount, 'id'))}`}>Xem tài khoản vừa tạo</Link>}
    </div>}
    {result && <section className="manager-section admin-bulk-result" role="status">
      <strong>Đã cập nhật {result.changed} · Bỏ qua {result.skipped} · Chưa xác nhận {result.failures.length}</strong>
      {!!result.failures.length && <ul>{result.failures.map(failure =>
        <li key={failure.id}>{failure.name} — {failure.reason}</li>
      )}</ul>}
    </section>}
    <div className="admin-account-toolbar">
      <input type="search" aria-label="Tìm tài khoản" maxLength={120} value={search}
        placeholder="Tên, email hoặc số điện thoại…" onChange={event => change('search', event.target.value)} />
      <label><span className="admin-filter-label">Trạng thái</span><select aria-label="Trạng thái" value={status} onChange={event => change('status', event.target.value)}>
        <option value="">Tất cả</option>{Object.entries(statuses).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
      </select></label>
      <TablePopover name="Lọc theo vai trò" trigger={<><Plus size={15} aria-hidden="true" />{roles.includes(role) ? label(role) : 'Vai trò'}</>}>
        {['', ...roles].map(value =>
          <button type="button" key={value} aria-pressed={role === value} onClick={event => {
            event.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover();
            change('role', value);
          }}>{value ? <AccountRole value={value} /> : 'Tất cả'}</button>
        )}
      </TablePopover>
      {(search || role || status) && <button type="button" className="button-secondary" onClick={() => {
        setSelection(undefined);
        const next = new URLSearchParams(params);
        for (const key of ['page', 'search', 'role', 'status']) next.delete(key);
        setParams(next, { replace: true });
      }}>Xóa bộ lọc</button>}
    </div>
    <LoadState loading={data.loading} error={data.error} retry={data.refresh} />
    {data.data && <>
      {data.data.items.length ? <StaffTaskTable title="Danh sách tài khoản" items={data.data.items} columns={columns} rowKey={row => first(row, 'id')} selected={row => selectedIds.has(first(row, 'id'))} />
        : <Empty title="Không tìm thấy tài khoản" />}
      <InternalPagination page={page} limit={limit} total={data.data.total} pageSizes={sizes} showBoundaryControls
        onChange={value => change('page', String(value))} onLimitChange={value => change('limit', String(value))} />
    </>}
    {!!selected.length && <div className="admin-bulk-bar" role="group" aria-label="Thao tác tài khoản đã chọn">
      <button type="button" className="icon-button" aria-label="Bỏ chọn tất cả" onClick={() => setSelection(undefined)}><X size={16} /></button>
      <span aria-live="polite">Đã chọn {selected.length}</span>
      <button type="button" className="button-secondary" disabled={!selected.some(row => row.accountStatus === 'DISABLED')}
        onClick={() => startBulk('ACTIVE')}><UserRoundCheck size={16} />Kích hoạt tài khoản</button>
      <button type="button" className="button-secondary portal-danger" disabled={!selected.some(row => row.accountStatus === 'ACTIVE')}
        onClick={() => startBulk('DISABLED')}><UserRoundX size={16} />Vô hiệu hóa tài khoản</button>
    </div>}
    {bulk && <BulkStatusDialog {...bulk} onClose={() => setBulk(undefined)} onComplete={outcome => {
      setBulk(undefined);
      setSelection(undefined);
      setResult(outcome);
      data.refresh();
    }} />}
    {creating && <CreateUser onClose={() => setCreating(false)} onSuccess={row => {
      setCreating(false);
      setCreatedAccount(row);
      data.refresh();
    }} />}
  </section>;
}

function CreateUser({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (row: Row) => void;
}) {
  const [role, setRole] = useState("STAFF");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (lock.current) return;
    const data = new FormData(event.currentTarget);
    if (data.get('password') !== data.get('confirmPassword')) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      onSuccess(
        await mutate("/admin/users", "POST", {
          fullName: String(data.get("fullName")).trim(),
          email: String(data.get("email")).trim(),
          phone: String(data.get("phone")).trim(),
          password: String(data.get("password")),
          role,
        }),
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Không thể tạo tài khoản.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal title="Tạo tài khoản" onClose={onClose} busy={busy}>
      <form className="portal-form" onSubmit={submit}>

        {error && (
          <div className="booking-alert is-error" role="alert">
            {error}
          </div>
        )}
        <fieldset className="admin-create-fields" disabled={busy}>
          <label className="field-label">
            Họ và tên
            <input
              name="fullName"
              required
              minLength={2}
              maxLength={120}
              autoComplete="name"
            />
          </label>
          <label className="field-label">
            Email
            <input
              type="email"
              name="email"
              required
              maxLength={254}
              autoComplete="off"
            />
          </label>
          <label className="field-label">
            Số điện thoại
            <input
              type="tel"
              name="phone"
              required
              minLength={8}
              maxLength={25}
              autoComplete="tel"
            />
          </label>
          <label className="field-label">
            Vai trò
            <select aria-label="Vai trò" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="STAFF">Nhân viên</option>
              <option value="MANAGER">Quản lý</option>
            </select>
          </label>
          <label className="field-label">
            Mật khẩu ban đầu
            <div className="portal-password">
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                maxLength={200}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="icon-button"
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>
          <label className="field-label">
            Xác nhận mật khẩu
            <input name="confirmPassword" type={showPassword ? 'text' : 'password'} required
              autoComplete="new-password" maxLength={200} />
          </label>
        </fieldset>
        <div className="portal-actions">
          <button
            type="button"
            className="button-secondary"
            onClick={onClose}
            disabled={busy}
          >
            Hủy
          </button>
          <button className="button-primary" disabled={busy}>
            {busy ? "Đang tạo…" : "Tạo tài khoản"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function BulkStatusDialog({ status, rows, skipped, onClose, onComplete }: {
  status: AccountStatus;
  rows: Row[];
  skipped: number;
  onClose: () => void;
  onComplete: (result: BulkResult) => void;
}) {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const disabling = status === 'DISABLED';
  const action = disabling ? 'Vô hiệu hóa tài khoản' : 'Kích hoạt tài khoản';
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    const expectedToken = safeLocalStorage.getItem(AUTH_TOKEN_KEY);
    const result: BulkResult = { changed: 0, skipped, failures: [] };
    for (const row of rows) {
      const id = first(row, 'id');
      try {
        await apiRequest(`/admin/users/${encodeURIComponent(id)}/status`, {
          method: 'PATCH', body: JSON.stringify({ accountStatus: status }), expectedToken,
        });
        result.changed++;
      } catch (error) {
        result.failures.push({
          id, name: first(row, 'email', 'fullName'),
          reason: error instanceof Error ? error.message : 'Không thể xác minh kết quả. Kiểm tra trạng thái trước khi thử lại.',
        });
      }
    }
    onComplete(result);
  }
  return <Modal title={action} busy={busy} onClose={onClose}>
    <form className="portal-form" onSubmit={submit}>
      <p>{disabling ? 'Vô hiệu hóa' : 'Kích hoạt'} <strong>{rows.length} tài khoản</strong>.{skipped > 0 && ` Bỏ qua ${skipped} tài khoản đã ở trạng thái này.`}</p>
      {disabling && <p>Người dùng bị vô hiệu hóa sẽ mất quyền truy cập theo chính sách phiên đăng nhập hiện tại.</p>}
      <div className="portal-actions">
        <button type="button" className="button-secondary" disabled={busy} onClick={onClose}>Hủy</button>
        <button type="submit" className={disabling ? 'button-secondary portal-danger' : 'button-primary'} disabled={busy}>
          {busy ? 'Đang xử lý…' : 'Xác nhận'}
        </button>
      </div>
    </form>
  </Modal>;
}
