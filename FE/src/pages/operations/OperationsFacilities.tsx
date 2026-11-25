import { useId, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Ellipsis, Plus, Search } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { Empty, Facts, LoadState, Modal, PageHeader, Status } from '../../components/manager/PortalUi';
import { useConfirmation } from '../../components/workspace/ConfirmationProvider';
import { TablePopover } from '../../components/workspace/StaffTaskTable';
import { useListPagination } from '../../components/workspace/useListPagination';
import { apiRequest } from '../../services/api';
import { useApiResource } from '../../services/useApiResource';
import './operations-facilities.css';

const base = '/operations/facilities';
const states = { OPEN: 'Đang hoạt động', CLOSING: 'Đang ngừng hoạt động', CLOSED: 'Đã ngừng hoạt động' };
const modes = {
  CONTRACT_EXPIRY: 'Kết thúc theo thời hạn hợp đồng',
  REQUIRED_RELOCATION: 'Di dời bắt buộc',
};
type State = keyof typeof states;
type Mode = keyof typeof modes;
type Facility = {
  id: string; code: string; name: string; address: string; officeHours: string | null; accessHours: string | null;
  bookingEnabled: boolean; operationalStatus: State; updatedAt: string;
  closureMode?: Mode | null; closureReason?: string | null; closureExpectedAt?: string | null; closureStartedAt?: string | null;
  closureProgress?: { activeContracts: number; openTasks: number; openTransfers: number; pendingBookings: number };
};
type Dialog = { kind: 'create' } | { kind: 'edit' | 'plan' | 'reopen'; facility: Facility };
const report = (id: string) => '/operations/reports?' + new URLSearchParams({ facilityId: id });
const booking = (facility: Facility) => facility.operationalStatus !== 'OPEN' ? 'Không tiếp nhận' : facility.bookingEnabled ? 'Đang nhận' : 'Tạm dừng';
const textOrFallback = (text?: string | null) => text?.trim() || 'Chưa thiết lập';
const formatDate = (value?: string | null, includeTime = false) => value
  ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', ...(includeTime ? { timeStyle: 'short' } : {}), timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value))
  : 'Chưa thiết lập';
const statusBadge = (state: State) => <Status value={'facility-' + state} text={states[state] ?? 'Chưa xác định'} />;
const detailsUrl = (id: string, search: string) => base + '/' + encodeURIComponent(id) + search;

export function OperationsFacilities() {
  const { user } = useAuth();
  const { facilityId } = useParams();
  const { search: urlSearch } = useLocation();
  // The API supplies the complete list, including closure progress. Resolve detail from this same request.
  const resource = useApiResource<Facility[]>(base, user?.id, false, true);
  const confirm = useConfirmation();
  const working = useRef(false);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<Dialog>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const facility = resource.data?.find(item => item.id === facilityId);
  const filtered = (resource.data ?? []).filter(item =>
    (!filter || item.operationalStatus === filter) &&
    [item.name, item.code, item.address].some(value => value?.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi'))));
  const { items, pagination } = useListPagination(filtered);

  function open(value: Dialog) {
    setNotice('');
    setError('');
    setDialog(value);
  }

  async function save(body: object, success: string, target?: Facility, confirmation?: Parameters<typeof confirm>[0]) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (confirmation && !(await confirm(confirmation))) return;
      await apiRequest(target ? base + '/' + encodeURIComponent(target.id) : base, {
        method: target ? 'PATCH' : 'POST',
        body: JSON.stringify({ ...body, ...(target ? { expectedUpdatedAt: target.updatedAt } : {}) }),
      });
      setDialog(undefined);
      setNotice(success);
      resource.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Chưa lưu được cơ sở.');
    } finally {
      setBusy(false);
      working.current = false;
    }
  }

  function reopen(target: Facility) {
    if (target.closureMode === 'REQUIRED_RELOCATION') return open({ kind: 'reopen', facility: target });
    const cancelling = target.operationalStatus === 'CLOSING';
    const action = cancelling ? 'Hủy kế hoạch ngừng kinh doanh' : 'Mở lại cơ sở';
    void save({ operationalStatus: 'OPEN', bookingEnabled: false }, 'Cơ sở đã hoạt động trở lại.', target, {
      title: action, description: 'Cơ sở sẽ hoạt động trở lại. Nhận đặt kho mới vẫn tạm dừng.', confirmLabel: action,
    });
  }

  return <section className="bom-facilities">
    {facilityId && <Link className="bom-facility-back" to={base + urlSearch}><ArrowLeft size={16} aria-hidden="true" /> Cơ sở</Link>}
    {!facilityId && <PageHeader title="Cơ sở">
      <button className="button-primary" onClick={() => open({ kind: 'create' })}><Plus size={17} aria-hidden="true" /> Thêm cơ sở</button>
    </PageHeader>}
    <LoadState loading={resource.loading} error={resource.error} retry={resource.refresh} layout={facilityId ? 'detail' : 'list'} />
    {notice && <p className="bom-facility-notice" role="status">{notice}</p>}
    {!dialog && error && <div className="booking-alert is-error" role="alert">{error}</div>}
    {!resource.loading && !resource.error && (facilityId
      ? facility ? <>
        <PageHeader title={facility.name} status={statusBadge(facility.operationalStatus)} meta={facility.code}>
          <Link className="button-secondary" to={report(facility.id)}>Hiệu quả cơ sở</Link>
          <button className="button-primary" disabled={busy || resource.refreshing} onClick={() => open({ kind: 'edit', facility })}>Chỉnh sửa</button>
        </PageHeader>
        <div className="bom-facility-panels">
          <section className="manager-section">
            <h2>Thông tin cơ sở</h2>
            <Facts items={[
              ['Mã cơ sở', facility.code], ['Tên cơ sở', facility.name], ['Địa chỉ', textOrFallback(facility.address)],
              ['Giờ làm việc', textOrFallback(facility.officeHours)], ['Giờ khách ra vào', textOrFallback(facility.accessHours)],
            ]} />
          </section>
          <section className="manager-section">
            <h2>Trạng thái kinh doanh</h2>
            <Facts items={[[ 'Hoạt động', statusBadge(facility.operationalStatus) ], [ 'Nhận đặt kho', booking(facility) ]]} />
            <BookingSwitch enabled={facility.operationalStatus === 'OPEN' && facility.bookingEnabled}
              disabled={facility.operationalStatus !== 'OPEN' || busy || resource.refreshing}
              description={facility.operationalStatus === 'OPEN' ? 'Tạm dừng đặt kho mới vẫn giữ nguyên các hợp đồng hiện tại.' : 'Chỉ có thể bật khi cơ sở đang hoạt động.'}
              onToggle={() => void save({ bookingEnabled: !facility.bookingEnabled }, facility.bookingEnabled ? 'Đã tạm dừng nhận đặt kho.' : 'Đã bật nhận đặt kho.', facility, {
                title: facility.bookingEnabled ? 'Tạm dừng nhận đặt kho' : 'Bật nhận đặt kho',
                description: facility.bookingEnabled ? 'Khách hiện tại vẫn sử dụng kho theo hợp đồng.' : 'Khách có thể đặt kho mới tại cơ sở này.',
                confirmLabel: facility.bookingEnabled ? 'Tạm dừng nhận' : 'Bật nhận đặt kho',
              })} />
            {facility.operationalStatus !== 'CLOSING' && <div className="portal-actions bom-facility-actions">
              <button className="button-secondary" disabled={busy || resource.refreshing} onClick={() => facility.operationalStatus === 'OPEN' ? open({ kind: 'plan', facility }) : reopen(facility)}>
                {facility.operationalStatus === 'OPEN' ? 'Bắt đầu ngừng kinh doanh' : 'Mở lại cơ sở'}
              </button>
            </div>}
          </section>
        </div>
        {(facility.operationalStatus === 'CLOSING' || facility.closureMode) && <section className="manager-section">
          <h2>Kế hoạch ngừng kinh doanh</h2>
          <Facts items={[
            ['Phương án', facility.closureMode ? modes[facility.closureMode] ?? 'Chưa xác định' : 'Chưa thiết lập'],
            ['Lý do', textOrFallback(facility.closureReason)], ['Bắt đầu', formatDate(facility.closureStartedAt, true)], ['Ngày dự kiến', formatDate(facility.closureExpectedAt)],
          ]} />
          {facility.closureProgress && <>
            <h3>Hồ sơ cần theo dõi</h3>
            <Facts items={[
              ['Hợp đồng đang sử dụng', facility.closureProgress.activeContracts],
              ['Đơn đặt kho đang chờ', facility.closureProgress.pendingBookings],
              ['Việc hỗ trợ còn mở', facility.closureProgress.openTasks],
              ['Hồ sơ chuyển kho chưa xong', facility.closureProgress.openTransfers],
            ]} />
          </>}
          {facility.operationalStatus === 'CLOSING' && <div className="portal-actions bom-facility-actions">
            <button className="button-secondary" disabled={busy || resource.refreshing} onClick={() => open({ kind: 'plan', facility })}>
              {facility.closureMode === 'REQUIRED_RELOCATION' ? 'Chỉnh kế hoạch' : 'Chỉnh phương án'}
            </button>
            <button className="button-secondary" disabled={busy || resource.refreshing} onClick={() => reopen(facility)}>Hủy kế hoạch</button>
            <button className="button-primary" disabled={busy || resource.refreshing} onClick={() => void save({ operationalStatus: 'CLOSED', bookingEnabled: false }, 'Đã đóng cơ sở.', facility, {
              title: 'Đóng cơ sở hoàn toàn', description: 'Hệ thống sẽ kiểm tra các nghĩa vụ còn lại của cơ sở trước khi đóng.',
              confirmLabel: 'Xác nhận đóng cơ sở', destructive: true,
            })}>Đóng cơ sở hoàn toàn</button>
          </div>}
        </section>}
      </> : <Empty title="Không tìm thấy cơ sở" description="Quay về danh sách để chọn cơ sở khác." />
      : <>
        <div className="portal-toolbar bom-facility-toolbar">
          <label className="field-label">Tìm cơ sở
            <span className="portal-search"><Search size={17} aria-hidden="true" /><input value={search} placeholder="Tên hoặc mã cơ sở" onChange={event => setSearch(event.target.value)} /></span>
          </label>
          <label className="field-label">Trạng thái hoạt động
            <select value={filter} onChange={event => setFilter(event.target.value)}>
              <option value="">Tất cả trạng thái</option>
              {Object.entries(states).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        {items.length ? <><div className="manager-table-wrap bom-facility-table"><table className="manager-table" aria-label="Danh sách cơ sở">
          <thead><tr><th>Cơ sở</th><th>Địa chỉ</th><th>Trạng thái hoạt động</th><th>Nhận đặt kho</th><th>Thao tác</th></tr></thead>
          <tbody>{items.map(item => <tr key={item.id}>
            <td><Link className="bom-facility-name" to={detailsUrl(item.id, urlSearch)}>{item.name}</Link><small>{item.code}</small></td>
            <td>{textOrFallback(item.address)}</td><td>{statusBadge(item.operationalStatus)}</td><td>{booking(item)}</td>
            <td><TablePopover name={'Thao tác ' + item.name} trigger={<Ellipsis size={18} aria-hidden="true" />}>
              <Link to={detailsUrl(item.id, urlSearch)} onClick={dismissMenu}>Xem chi tiết</Link>
              <button type="button" onClick={event => { dismissMenu(event); open({ kind: 'edit', facility: item }); }}>Chỉnh sửa</button>
              <Link to={report(item.id)} onClick={dismissMenu}>Hiệu quả cơ sở</Link>
            </TablePopover></td>
          </tr>)}</tbody>
        </table></div>{pagination}</> : <Empty title={resource.data?.length ? 'Không có cơ sở phù hợp' : 'Chưa có cơ sở'}
          description={resource.data?.length ? 'Thử đổi từ khóa hoặc trạng thái.' : 'Chọn Thêm cơ sở để tạo cơ sở đầu tiên.'} />}
      </>)}
    {dialog && <FacilityDialog key={dialog.kind + ('facility' in dialog ? dialog.facility.id : '')}
      dialog={dialog} busy={busy} error={error} onClose={() => { setDialog(undefined); setError(''); }} onSave={save} />}
  </section>;
}

function dismissMenu(event: { currentTarget: HTMLElement }) {
  event.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover();
}

function BookingSwitch({ enabled, disabled, description, onToggle }: { enabled: boolean; disabled: boolean; description: string; onToggle?: () => void }) {
  const id = useId();
  return <div className="bom-facility-switch">
    <div><strong id={id + '-label'}>Nhận đặt kho mới</strong><p id={id + '-help'}>{description}</p></div>
    <button type="button" className="workspace-switch" role="switch" aria-checked={enabled} aria-labelledby={id + '-label'} aria-describedby={id + '-help'} disabled={disabled} onClick={onToggle} />
  </div>;
}

const fields = [
  { key: 'code', label: 'Mã cơ sở', max: 80, example: 'NB-02' },
  { key: 'name', label: 'Tên cơ sở', max: 120, example: 'NestBox Long Bình' },
  { key: 'address', label: 'Địa chỉ', max: 500, example: 'Số nhà, đường, phường, thành phố' },
  { key: 'officeHours', label: 'Giờ làm việc', max: 200, example: '08:00–18:00, Thứ Hai–Thứ Bảy' },
  { key: 'accessHours', label: 'Giờ khách ra vào', max: 200, example: '07:00–21:00 hằng ngày' },
] as const;

function FacilityDialog({ dialog, busy, error, onClose, onSave }: {
  dialog: Dialog; busy: boolean; error: string; onClose: () => void;
  onSave: (body: object, success: string, target?: Facility) => Promise<void>;
}) {
  const id = useId();
  const facility = 'facility' in dialog ? dialog.facility : undefined;
  const creating = dialog.kind === 'create';
  const editing = dialog.kind === 'edit';
  const planning = dialog.kind === 'plan';
  const starting = planning && facility?.operationalStatus === 'OPEN';
  const cancelling = dialog.kind === 'reopen' && facility?.operationalStatus === 'CLOSING';
  const [issues, setIssues] = useState<Record<string, string>>({});
  const title = creating ? 'Thêm cơ sở' : editing ? 'Chỉnh sửa cơ sở' : planning ? starting ? 'Bắt đầu ngừng kinh doanh' : 'Chỉnh kế hoạch ngừng kinh doanh' : cancelling ? 'Hủy kế hoạch ngừng kinh doanh' : 'Mở lại cơ sở';
  const submitLabel = creating ? 'Thêm cơ sở' : starting ? 'Xác nhận ngừng kinh doanh' : dialog.kind === 'reopen' ? 'Xác nhận mở lại' : 'Lưu thay đổi';

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const read = (name: string) => String(formData.get(name) ?? '').trim();
    const next: Record<string, string> = {};
    const required = (name: string, label: string, max: number) => {
      const value = read(name);
      if (!value) next[name] = 'Nhập ' + label.toLocaleLowerCase('vi') + '.';
      else if (value.length > max) next[name] = 'Tối đa ' + max + ' ký tự.';
      return value;
    };
    let body: object;
    if (creating || editing) {
      const values = Object.fromEntries(fields.flatMap(field => {
        if (editing && field.key === 'code') return [];
        if (editing && (field.key === 'accessHours' || field.key === 'officeHours') && !facility?.[field.key] && !read(field.key)) return [];
        return [[field.key, required(field.key, field.label, field.max)]];
      }));
      body = creating ? { ...values, operationalStatus: 'OPEN', bookingEnabled: false } : values;
    } else if (planning) {
      body = {
        operationalStatus: 'CLOSING', bookingEnabled: false, closureMode: read('closureMode'),
        closureReason: required('closureReason', 'Lý do ngừng kinh doanh', 500), closureExpectedAt: read('closureExpectedAt'),
      };
    } else {
      body = { operationalStatus: 'OPEN', bookingEnabled: false, reopeningSafetyEvidence: required('reopeningSafetyEvidence', 'Căn cứ xác nhận an toàn', 500) };
    }
    setIssues(next);
    const first = Object.keys(next)[0];
    if (first) { (form.elements.namedItem(first) as HTMLElement | null)?.focus(); return; }
    const message = creating ? 'Đã thêm cơ sở.' : editing ? 'Đã cập nhật thông tin cơ sở.' : planning ? 'Đã lưu kế hoạch ngừng kinh doanh.' : 'Cơ sở đã hoạt động trở lại.';
    void onSave(body, message, facility);
  }

  const issue = (key: string) => issues[key] && <small id={id + '-' + key} className="bom-facility-field-error">{issues[key]}</small>;
  const validation = (key: string) => ({ 'aria-invalid': !!issues[key], 'aria-describedby': issues[key] ? id + '-' + key : undefined });
  return <Modal title={title} className="bom-facility-dialog" busy={busy} onClose={onClose} focusTitle
    footer={<><button type="button" className="button-secondary" disabled={busy} onClick={onClose}>Hủy</button>
      <button type="submit" form={id} className="button-primary" disabled={busy}>{busy ? 'Đang lưu…' : submitLabel}</button></>}>
    <form id={id} className="bom-facility-form" onSubmit={submit} noValidate>
      {(creating || editing) && <div className="bom-facility-fields">
        {fields.map(field => <label className={'field-label' + (field.key === 'address' ? ' bom-facility-span' : '')} key={field.key}>
          {field.label}<input name={field.key} maxLength={field.max} placeholder={field.example} defaultValue={facility?.[field.key] ?? ''}
            readOnly={editing && field.key === 'code'} required={creating || !['officeHours', 'accessHours'].includes(field.key)} {...validation(field.key)} />
          {issue(field.key)}
        </label>)}
      </div>}
      {creating && <BookingSwitch enabled={false} disabled description="Có thể bật nhận đặt kho sau khi cơ sở đủ điều kiện vận hành." />}
      {planning && <>
        <fieldset className="bom-facility-options">
          <legend>Phương án</legend>
          {Object.entries(modes).map(([value, label]) => <label key={value}>
            <input type="radio" name="closureMode" value={value} defaultChecked={value === (facility?.closureMode ?? 'CONTRACT_EXPIRY')}
              disabled={value === 'CONTRACT_EXPIRY' && facility?.closureMode === 'REQUIRED_RELOCATION'} />
            <span><strong>{label}</strong><small>{value === 'CONTRACT_EXPIRY'
              ? 'Phục vụ đến hết hạn và hỗ trợ khách có nhu cầu chuyển kho.'
              : 'Hỗ trợ khách di dời hoặc thống nhất phương án thay thế.'}</small></span>
          </label>)}
        </fieldset>
        <label className="field-label">Lý do ngừng kinh doanh<textarea name="closureReason" required maxLength={500} rows={3} defaultValue={facility?.closureReason ?? ''} {...validation('closureReason')} />{issue('closureReason')}</label>
        <label className="field-label">Ngày dự kiến ngừng phục vụ<input name="closureExpectedAt" type="date" defaultValue={facility?.closureExpectedAt?.slice(0, 10) ?? ''} /></label>
        <p className="bom-facility-notice">Dừng nhận đặt kho, gia hạn và dịch vụ mới. Các nghĩa vụ đã cam kết được giữ nguyên.</p>
      </>}
      {dialog.kind === 'reopen' && <>
        <p>Nhận đặt kho mới vẫn tạm dừng sau khi mở lại.</p>
        <label className="field-label">Căn cứ xác nhận an toàn<textarea name="reopeningSafetyEvidence" required maxLength={500} rows={3} {...validation('reopeningSafetyEvidence')} />{issue('reopeningSafetyEvidence')}</label>
      </>}
      {error && <div className="booking-alert is-error" role="alert">{error}</div>}
    </form>
  </Modal>;
}
