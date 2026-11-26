import { useId, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ChartNoAxesColumn, Ellipsis, Eye, Pencil, Plus, Search, TriangleAlert } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { Empty, Facts, LoadState, Modal, PageHeader, Status } from '../../components/manager/PortalUi';
import { useConfirmation } from '../../components/workspace/ConfirmationProvider';
import { DatePicker, TimePicker } from '../../components/workspace/DateTimeFields';
import { WorkingHoursPicker } from '../../components/workspace/WorkingHoursPicker';
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
type ServiceWindow = { weekday: number; starts: string; ends: string; capacity: number };
const clockParts = (clock: string): [string, string] => {
  const [hour, minute = ''] = clock.split(':');
  return [hour, minute];
};
const serviceClock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
type Facility = {
  id: string; code: string; name: string; address: string; officeHours: string | null; accessHours: string | null;
  bookingEnabled: boolean; operationalStatus: State; updatedAt: string;
  serviceSchedule?: ServiceWindow[];
  closureMode?: Mode | null; closureReason?: string | null; closureExpectedAt?: string | null; closureStartedAt?: string | null;
  closureProgress?: { activeContracts: number; openTasks: number; openTransfers: number; pendingBookings: number };
};
type Dialog = { kind: 'create' } | { kind: 'edit' | 'plan' | 'reopen'; facility: Facility };
const report = (id: string) => '/operations/reports?' + new URLSearchParams({ facilityId: id });
const booking = (facility: Facility) => facility.operationalStatus !== 'OPEN' ? 'Không tiếp nhận' : facility.bookingEnabled ? 'Đang nhận' : 'Tạm dừng';
const bookingDescription = (facility: Facility) => facility.operationalStatus !== 'OPEN' ? 'Cơ sở hiện không tiếp nhận khách thuê mới.'
  : facility.bookingEnabled ? 'Đang tiếp nhận khách thuê mới.' : 'Đang tạm dừng nhận khách thuê mới.';
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
          <section className="manager-section bom-facility-info">
            <h2>Thông tin cơ sở</h2>
            <Facts items={[
              ['Địa chỉ', textOrFallback(facility.address)],
              ['Giờ làm việc', textOrFallback(facility.officeHours)], ['Giờ khách ra vào', textOrFallback(facility.accessHours)],
            ]} />
          </section>
          <section className="manager-section">
            <h2>Trạng thái kinh doanh</h2>
            <BookingSwitch enabled={facility.operationalStatus === 'OPEN' && facility.bookingEnabled}
              disabled={facility.operationalStatus !== 'OPEN' || busy || resource.refreshing}
              description={bookingDescription(facility)}
              onToggle={() => void save({ bookingEnabled: !facility.bookingEnabled }, facility.bookingEnabled ? 'Đã tạm dừng nhận đặt kho.' : 'Đã bật nhận đặt kho.', facility, {
                title: facility.bookingEnabled ? 'Tạm dừng nhận đặt kho' : 'Bật nhận đặt kho',
                description: facility.bookingEnabled ? 'Khách hiện tại vẫn sử dụng kho theo hợp đồng.' : 'Khách có thể đặt kho mới tại cơ sở này.',
                confirmLabel: facility.bookingEnabled ? 'Tạm dừng nhận' : 'Bật nhận đặt kho',
              })} />
            <div className="bom-facility-closure">
              <div><h3>Ngừng kinh doanh</h3><p>{facility.operationalStatus === 'OPEN' ? 'Lập kế hoạch kết thúc phục vụ tại cơ sở.'
                : facility.operationalStatus === 'CLOSING' ? 'Theo dõi kế hoạch và các hồ sơ bên dưới.' : 'Có thể mở lại khi cơ sở đủ điều kiện.'}</p></div>
              {facility.operationalStatus !== 'CLOSING' && <button type="button" className="button-secondary" disabled={busy || resource.refreshing} onClick={() => facility.operationalStatus === 'OPEN' ? open({ kind: 'plan', facility }) : reopen(facility)}>
                {facility.operationalStatus === 'OPEN' ? 'Bắt đầu ngừng kinh doanh' : 'Mở lại cơ sở'}
              </button>}
            </div>
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
            <span className="bom-facility-search"><Search size={17} aria-hidden="true" /><input type="search" value={search} placeholder="Tên hoặc mã cơ sở" onChange={event => setSearch(event.target.value)} /></span>
          </label>
          <label className="field-label">Trạng thái hoạt động
            <select aria-label="Trạng thái hoạt động" value={filter} onChange={event => setFilter(event.target.value)}>
              <option value="">Tất cả trạng thái</option>
              {Object.entries(states).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        {items.length ? <><div className="manager-table-wrap bom-facility-table"><table className="manager-table" aria-label="Danh sách cơ sở">
          <thead><tr><th>Cơ sở</th><th>Địa chỉ</th><th>Trạng thái hoạt động</th><th>Nhận đặt kho</th><th>Thao tác</th></tr></thead>
          <tbody>{items.map(item => <tr key={item.id}>
            <td><Link className="bom-facility-name" to={detailsUrl(item.id, urlSearch)}>{item.name}</Link><small>{item.code}</small></td>
            <td>{textOrFallback(item.address)}</td><td>{statusBadge(item.operationalStatus)}</td>
            <td><span className="bom-booking-state" data-accepting={item.operationalStatus === 'OPEN' && item.bookingEnabled}>{booking(item)}</span></td>
            <td><TablePopover name={'Thao tác ' + item.name} panelClassName="bom-facility-menu" trigger={<Ellipsis size={18} aria-hidden="true" />}>
              <Link to={detailsUrl(item.id, urlSearch)} onClick={dismissMenu}><Eye size={16} aria-hidden="true" /> Xem chi tiết</Link>
              <button type="button" onClick={event => { dismissMenu(event); open({ kind: 'edit', facility: item }); }}><Pencil size={16} aria-hidden="true" /> Chỉnh sửa</button>
              <Link to={report(item.id)} onClick={dismissMenu}><ChartNoAxesColumn size={16} aria-hidden="true" /> Hiệu quả cơ sở</Link>
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
] as const;
const hourFields = [['officeHours', 'Giờ làm việc'], ['accessHours', 'Giờ khách ra vào']] as const;

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
  const [serviceSchedule, setServiceSchedule] = useState(() => facility?.serviceSchedule ?? []);
  const [scheduleChanged, setScheduleChanged] = useState(false);
  const changeWindow = (index: number, value: Partial<ServiceWindow>) => {
    setScheduleChanged(true);
    setServiceSchedule(rows => rows.map((row, i) => i === index ? { ...row, ...value } : row));
  };
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
        return [[field.key, required(field.key, field.label, field.max)]];
      }));
      for (const [key, label] of hourFields) {
        const changed = read(key + 'Changed');
        if (!creating && !changed) continue;
        if (read(key + 'Partial')) { next[key] = 'Chọn một khung giờ hợp lệ.'; continue; }
        if (!creating && !facility?.[key] && !read(key)) continue;
        values[key] = required(key, label, 200);
      }
      const sorted = [...serviceSchedule].sort((a, b) => a.weekday - b.weekday || a.starts.localeCompare(b.starts));
      if (sorted.some((row, index) => !serviceClock.test(row.starts) || row.ends !== '24:00' && !serviceClock.test(row.ends) || row.starts >= row.ends
        || !Number.isSafeInteger(row.capacity) || row.capacity < 1
        || index > 0 && row.weekday === sorted[index - 1].weekday && row.starts < sorted[index - 1].ends)) {
        next.serviceSchedule = 'Kiểm tra giờ bắt đầu, giờ kết thúc, sức chứa và các khung giờ trùng nhau.';
      }
      body = { ...values, ...(creating ? { operationalStatus: 'OPEN', bookingEnabled: false } : {}),
        ...(scheduleChanged ? { serviceSchedule: sorted } : {}) };
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
    if (first) {
      const field = form.querySelector<HTMLElement>('[data-hours-field="' + first + '"] button') ??
        form.elements.namedItem(first) as HTMLElement | null;
      field?.focus();
      return;
    }
    const message = creating ? 'Đã thêm cơ sở.' : editing ? 'Đã cập nhật thông tin cơ sở.' : planning ? 'Đã lưu kế hoạch ngừng kinh doanh.' : 'Cơ sở đã hoạt động trở lại.';
    void onSave(body, message, facility);
  }

  const issue = (key: string) => issues[key] && <small id={id + '-' + key} className="bom-facility-field-error">{issues[key]}</small>;
  const validation = (key: string) => ({ 'aria-invalid': !!issues[key], 'aria-describedby': issues[key] ? id + '-' + key : undefined });
  return <Modal title={title} className={'bom-facility-dialog' + (creating || editing ? ' bom-facility-editor' : '')} busy={busy} onClose={onClose} focusTitle
    footer={<><button type="button" className="button-secondary" disabled={busy} onClick={onClose}>Hủy</button>
      <button type="submit" form={id} className={starting ? 'button-secondary portal-danger' : 'button-primary'} disabled={busy}>{busy ? 'Đang lưu…' : submitLabel}</button></>}>
    <form id={id} className="bom-facility-form" onSubmit={submit} noValidate>
      {(creating || editing) && <div className="bom-facility-fields">
        {fields.map(field => <label className={'field-label' + (field.key === 'address' ? ' bom-facility-span' : '')} key={field.key}>
          <span>{field.label}{(!editing || field.key !== 'code') && <span aria-hidden="true"> *</span>}</span>
          <input name={field.key} maxLength={field.max} placeholder={field.example} defaultValue={facility?.[field.key] ?? ''}
            readOnly={editing && field.key === 'code'} required={!editing || field.key !== 'code'} {...validation(field.key)} />
          {issue(field.key)}
        </label>)}
        {hourFields.map(([key, label]) => <div className="bom-facility-span" key={key}><WorkingHoursPicker name={key} label={label}
          original={facility?.[key] ?? ''} required={creating || Boolean(facility?.[key])} error={issues[key]}
          onEdit={() => { if (issues[key]) setIssues(previous => ({ ...previous, [key]: '' })); }} /></div>)}
        <fieldset className="bom-facility-span bom-service-windows">
          <legend>Giờ phục vụ và năng lực tiếp nhận</legend>
          <p>Giờ Việt Nam (UTC+7). Sức chứa là số lịch hẹn trong mỗi khung, gồm bàn giao và kiểm tra trả kho.</p>
          {serviceSchedule.map((row, index) => <div className="bom-service-window" key={index}>
            <label className="field-label">Ngày
              <select value={row.weekday} onChange={event => changeWindow(index, { weekday: Number(event.target.value) })}>
                {['Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy', 'Chủ nhật'].map((day, i) => <option key={day} value={i + 1}>{day}</option>)}
              </select>
            </label>
            <TimePicker label="Bắt đầu" parts={clockParts(row.starts)} onPartsChange={parts => changeWindow(index, { starts: parts.join(':') })} />
            {row.ends === '24:00' ? <span>Kết thúc lúc 24:00</span>
              : <TimePicker label="Kết thúc" parts={clockParts(row.ends)} onPartsChange={parts => changeWindow(index, { ends: parts.join(':') })} />}
            <label className="portal-checkbox"><input type="checkbox" checked={row.ends === '24:00'}
              onChange={event => changeWindow(index, { ends: event.target.checked ? '24:00' : '' })} />Đến hết ngày</label>
            <label className="field-label">Sức chứa<input type="number" min={1} step={1} value={row.capacity || ''}
              onChange={event => changeWindow(index, { capacity: Number(event.target.value) })} /></label>
            <button type="button" className="button-secondary" onClick={() => {
              setScheduleChanged(true); setServiceSchedule(rows => rows.filter((_, i) => i !== index));
            }}>Xóa khung</button>
          </div>)}
          <button name="serviceSchedule" type="button" className="button-secondary" onClick={() => {
            setScheduleChanged(true); setServiceSchedule(rows => [...rows, { weekday: 1, starts: '', ends: '', capacity: 1 }]);
          }}>Thêm khung giờ</button>
          {issue('serviceSchedule')}
        </fieldset>
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
        <label className="field-label"><span>Lý do ngừng kinh doanh <span aria-hidden="true">*</span></span><textarea name="closureReason" required maxLength={500} rows={2} defaultValue={facility?.closureReason ?? ''} {...validation('closureReason')} />{issue('closureReason')}</label>
        <DatePicker label="Ngày dự kiến ngừng phục vụ" name="closureExpectedAt" defaultValue={facility?.closureExpectedAt?.slice(0, 10) ?? ''} />
        <p className="bom-facility-warning"><TriangleAlert size={16} aria-hidden="true" />Dừng nhận đặt kho, gia hạn và dịch vụ mới. Các nghĩa vụ đã cam kết được giữ nguyên.</p>
      </>}
      {dialog.kind === 'reopen' && <>
        <p>Nhận đặt kho mới vẫn tạm dừng sau khi mở lại.</p>
        <label className="field-label"><span>Căn cứ xác nhận an toàn <span aria-hidden="true">*</span></span><textarea name="reopeningSafetyEvidence" required maxLength={500} rows={3} {...validation('reopeningSafetyEvidence')} />{issue('reopeningSafetyEvidence')}</label>
      </>}
      {error && <div className="booking-alert is-error" role="alert">{error}</div>}
    </form>
  </Modal>;
}
