import { Ellipsis, Eye, EyeOff, Plus, RefreshCw, Search } from 'lucide-react';
import { useId, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { AdminAvatar } from './AdminAvatar';
import { AccountRole, accountRoleLabel } from './AccountRole';
import { accountNameError, accountPhoneError } from './account-validation';
import { useAuth } from '../../auth/auth-context';
import { mutate } from '../../services/portal';
import { useInternalListResource } from '../../components/workspace/useInternalListResource';
import { InternalPagination } from '../../components/workspace/InternalPagination';
import { StaffTaskTable, TablePopover, type StaffColumn } from '../../components/workspace/StaffTaskTable';
import { date, first, type Row } from '../../components/manager/portal-data';
import { Empty, LoadState, Modal, PageHeader, Status } from '../../components/manager/PortalUi';

import { internalPageSize } from '../../utils/internal-pagination';
const roles = ['STORAGE_CUSTOMER', 'FACILITY_STAFF', 'FACILITY_MANAGER', 'BUSINESS_OPERATIONS_MANAGER', 'SYSTEM_ADMINISTRATOR'];
const statuses = { ACTIVE: 'Đang hoạt động', DISABLED: 'Đã khóa' };
const accountDetailPath = (id: string) => `/admin/users/${encodeURIComponent(id)}`;

export function AdminAccountsPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [createdAccount, setCreatedAccount] = useState<Row>();
  const { pathname, search: locationSearch } = useLocation();
  const sort = params.get('sort') ?? 'newest';
  const search = params.get('search') ?? '';
  const role = params.get('role') ?? '';
  const status = params.get('status') ?? '';
  const limit = internalPageSize(params);
  const page = Math.max(1, Math.min(100000, Math.floor(Number(params.get('page')) || 1)));
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search.trim()) query.set('search', search.trim());
  if (sort !== 'newest') query.set('sort', sort);
  if (role) query.set('role', role);
  if (status) query.set('accountStatus', status);
  const data = useInternalListResource<Row>(`/admin/users?${query}`, user?.id ?? '', true);

  function change(key: string, value: string) {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== 'page') next.delete('page');
      return next;
    }, { replace: true });
  }

  const columns: StaffColumn<Row>[] = [
    { key: 'account', label: 'Tài khoản', sort: { direction: sort === 'name-asc' ? 'ascending' : sort === 'name-desc' ? 'descending' : 'none', toggle: () => change('sort', sort === 'name-asc' ? 'name-desc' : 'name-asc') }, cell: row => {
      const id = first(row, 'id');
      const name = first(row, 'fullName', 'email');
      return <div className="admin-identity"><AdminAvatar name={name} /><div>
        <Link className="admin-account-name" to={accountDetailPath(id)} state={{ returnTo: pathname + locationSearch }} title={name}>{name}</Link>
        {first(row, 'email') !== name && <small title={first(row, 'email')}>{first(row, 'email')}</small>}
        {id === user?.id && <small>Tài khoản của bạn</small>}
      </div></div>;
    } },
    { key: 'role', label: 'Vai trò', cell: row => <AccountRole value={row.role} /> },
    { key: 'status', label: 'Trạng thái', cell: row => <Status value={row.accountStatus} /> },
    { key: 'date', label: 'Ngày tạo', sort: { direction: sort === 'oldest' ? 'ascending' : sort === 'newest' ? 'descending' : 'none', toggle: () => change('sort', sort === 'oldest' ? 'newest' : 'oldest') }, cell: row => date(row.createdAt) },
    { key: 'actions', label: 'Thao tác', cell: row => {
      const id = first(row, 'id');
      const canChangeStatus = id !== user?.id && (row.accountStatus === 'ACTIVE' || row.accountStatus === 'DISABLED');
      const state = { returnTo: pathname + locationSearch };
      const path = accountDetailPath(first(row, 'id'));
      const active = row.accountStatus === 'ACTIVE';
      return <div className="staff-table-actions">
        <TablePopover name={`Thao tác tài khoản ${first(row, 'email', 'fullName')}`} trigger={<Ellipsis size={18} aria-hidden="true" />}>
          <Link to={path} state={state}>Xem chi tiết</Link>
          {canChangeStatus && <Link className={active ? 'admin-destructive-link' : undefined}
            to={`${path}?tab=permissions&status=${active ? 'DISABLED' : 'ACTIVE'}`} state={state}>{active ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}</Link>}
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
      {first(createdAccount, 'id') && <Link to={accountDetailPath(first(createdAccount, 'id'))}>Xem tài khoản vừa tạo</Link>}
    </div>}
    <div className="admin-account-toolbar">
      <label className="admin-account-search">
        <Search size={17} aria-hidden="true" />
        <input type="search" aria-label="Tìm tài khoản" maxLength={120} value={search}
          placeholder="Tên, email hoặc số điện thoại…" onChange={event => change('search', event.target.value)} />
      </label>
      <label><span>Vai trò</span><select aria-label="Vai trò" value={role} onChange={event => change('role', event.target.value)}>
        <option value="">Tất cả</option>{roles.map(value => <option key={value} value={value}>{accountRoleLabel(value)}</option>)}
      </select></label>
      <label><span>Trạng thái</span><select aria-label="Trạng thái" value={status} onChange={event => change('status', event.target.value)}>
        <option value="">Tất cả</option>{Object.entries(statuses).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
      </select></label>
      {(search || role || status) && <button type="button" className="button-secondary" onClick={() => {
        const next = new URLSearchParams(params);
        for (const key of ['page', 'search', 'role', 'status']) next.delete(key);
        setParams(next, { replace: true });
      }}>Xóa bộ lọc</button>}
    </div>
    <LoadState loading={data.loading} error={data.error} retry={data.refresh} />
    {data.data && <>
      {data.data.items.length ? <StaffTaskTable title="Danh sách tài khoản" items={data.data.items} columns={columns} rowKey={row => first(row, 'id')} rowDetail={row => ({ to: accountDetailPath(first(row, 'id')), label: `Xem chi tiết tài khoản ${first(row, 'fullName', 'email')}` })} />
        : <Empty title="Không tìm thấy tài khoản" description={search || role || status ? 'Thử đổi từ khóa hoặc xóa bộ lọc.' : undefined} />}
      <InternalPagination page={page} limit={limit} total={data.data.total} showBoundaryControls
        onChange={value => change('page', String(value))} onLimitChange={value => change('limit', String(value))} />
    </>}
    {creating && <CreateUser onClose={() => setCreating(false)} onSuccess={row => {
      setCreating(false);
      setCreatedAccount(row);
      data.refresh();
    }} />}
  </section>;
}
function CreateUser({ onClose, onSuccess }: { onClose: () => void; onSuccess: (row: Row) => void }) {
  const formId = useId();
  const [values, setValues] = useState({ fullName: '', email: '', phone: '', password: '', confirmPassword: '', role: 'FACILITY_STAFF' });
  const [touched, setTouched] = useState<Partial<Record<keyof typeof values, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');
  const lock = useRef(false);
  const fullName = values.fullName.trim(), email = values.email.trim(), phone = values.phone.trim();
  const errors = {
    fullName: accountNameError(fullName),
    email: emailError || (email.length < 5 || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email) ? 'Email không hợp lệ.' : ''),
    phone: accountPhoneError(phone),
    password: values.password.length < 8 || values.password.length > 128 || !values.password.trim() ? 'Mật khẩu phải có 8–128 ký tự.' : '',
    confirmPassword: !values.confirmPassword || values.confirmPassword !== values.password ? 'Mật khẩu xác nhận không khớp.' : '',
  };
  type Field = keyof typeof errors;
  const issue = (field: Field) => (submitted || touched[field] || (field === 'email' && emailError)) && errors[field];
  const message = (field: Field) => issue(field) && <small id={formId + '-' + field} className="admin-field-error" role="alert">{errors[field]}</small>;
  const input = (field: Field) => ({
    name: field, value: values[field], required: true, 'aria-invalid': Boolean(issue(field)),
    'aria-describedby': [field === 'password' ? formId + '-password-hint' : '', issue(field) ? formId + '-' + field : ''].filter(Boolean).join(' ') || undefined,
    onBlur: () => setTouched(current => ({ ...current, [field]: true })),
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      setValues(current => ({ ...current, [field]: event.target.value }));
      if (field === 'email') setEmailError('');
    },
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    setSubmitted(true);
    const invalid = (Object.keys(errors) as Field[]).find(field => errors[field]);
    if (invalid) {
      (event.currentTarget.elements.namedItem(invalid) as HTMLInputElement | null)?.focus();
      return;
    }
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      onSuccess(await mutate('/admin/users', 'POST', { fullName, email, phone, password: values.password, role: values.role }));
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : 'Không thể tạo tài khoản.';
      if (/^email\b/i.test(text)) setEmailError(text);
      else setError(text);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return <Modal title="Tạo tài khoản" className="admin-create-dialog admin-account-modal" onClose={onClose} busy={busy} footer={<>
    <button type="button" className="button-secondary" disabled={busy} onClick={onClose}>Hủy</button>
    <button type="submit" form={formId} className="button-primary" disabled={busy}>{busy ? 'Đang tạo…' : 'Tạo tài khoản'}</button>
  </>}>
    <form id={formId} className="portal-form" noValidate onSubmit={submit}>
      <fieldset className="admin-account-fields" disabled={busy}>
        <legend>Thông tin cá nhân</legend>
        <label className="field-label">Họ và tên<input {...input('fullName')} maxLength={120} autoComplete="name" />{message('fullName')}</label>
        <label className="field-label">Email<input {...input('email')} type="email" maxLength={254} autoComplete="off" />{message('email')}</label>
        <label className="field-label">Số điện thoại<input {...input('phone')} type="tel" maxLength={25} autoComplete="tel" />{message('phone')}</label>
      </fieldset>
      <fieldset className="admin-account-fields" disabled={busy}>
        <legend>Thông tin truy cập</legend>
        <label className="field-label">Vai trò<select aria-label="Vai trò" value={values.role} onChange={event => setValues({ ...values, role: event.target.value })}>
          <option value="FACILITY_STAFF">Nhân viên cơ sở</option><option value="FACILITY_MANAGER">Quản lý cơ sở</option>
          <option value="BUSINESS_OPERATIONS_MANAGER">Điều hành kinh doanh</option>
        </select></label>
        <label className="field-label">Mật khẩu ban đầu
          <div className="portal-password">
            <input {...input('password')} type={showPassword ? 'text' : 'password'} maxLength={128} autoComplete="new-password" />
            <button type="button" className="icon-button" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
          </div>
          <small id={formId + '-password-hint'}>8–128 ký tự, có ít nhất một ký tự khác khoảng trắng.</small>
          {message('password')}
        </label>
        <label className="field-label">Xác nhận mật khẩu
          <input {...input('confirmPassword')} type={showPassword ? 'text' : 'password'} maxLength={128} autoComplete="new-password" />
          {message('confirmPassword')}
        </label>
      </fieldset>
      {error && <p className="booking-alert is-error" role="alert">{error}</p>}
    </form>
  </Modal>;
}
