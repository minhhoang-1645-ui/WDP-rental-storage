import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { CalendarClock, ClipboardList, CreditCard, FileText, History, Pencil, RefreshCw } from 'lucide-react';
import { Modal } from '../../components/manager/PortalUi';
import { useConfirmation } from '../../components/workspace/ConfirmationProvider';
import { DatePicker, TimePicker } from '../../components/workspace/DateTimeFields';
import { useCurrentTime } from '../../hooks/useCurrentTime';
import { vietnamLocalMinute } from '../../utils/handover';
import { useAuth } from '../../auth/auth-context';
import { apiRequest } from '../../services/api';
import { useApiResource } from '../../services/useApiResource';
import { PricingPolicyFields, pricingPolicySummary, readPricingPolicy, type PricingPolicy } from './PricingPolicyFields';
import { DurationField, durationMinutes } from './PolicyTimeFields';
import './operations-policies.css';

type Version = { id: string; version: number; value: number; effectiveFrom: string; effectiveTo: string | null; status: string; author: string | null };
type ScalarPolicy = { key: string; title: string; description: string; value: number; min: number; max: number; unit: string; updatedAt: string | null; effectiveVersion: number; history: Version[] };
type Policy = ScalarPolicy | PricingPolicy;
type Catalog = { items: ScalarPolicy[]; pricing: PricingPolicy[] };
const endpoint = '/operations/business-policies';
const groups = [
  { label: 'Đặt kho và thanh toán', icon: CreditCard, keys: ['reservationHoldMinutes', 'deposit', 'prepaid', 'cancellation'] },
  { label: 'Hợp đồng và bàn giao', icon: FileText, keys: ['handoverLeadDays', 'renewal', 'returnNoticeDays', 'earlyReturn'] },
  { label: 'Quá hạn và nhắc nhở', icon: CalendarClock, keys: ['renewalReminderDays', 'paymentReminderDays', 'paymentOverdue', 'returnOverdue'] },
];
const editorTabs = [{ label: 'Chính sách', icon: ClipboardList }, { label: 'Lịch sử phiên bản', icon: History }];
const statuses: Record<string, string> = { EFFECTIVE: 'Đang áp dụng', SCHEDULED: 'Đã lên lịch', HISTORICAL: 'Đã hết hiệu lực' };
const time = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const formatTime = (value: string) => {
  const parts = Object.fromEntries(time.formatToParts(new Date(value)).map(part => [part.type, part.value]));
  return parts.day + '/' + parts.month + '/' + parts.year + ' ' + parts.hour + ':' + parts.minute;
};
const scalar = (value: number, unit: string) => unit === 'phút' && value >= 60 && value % 60 === 0 ? value / 60 + ' giờ' : value + ' ' + unit;
const summary = (policy: Policy) => 'unit' in policy ? scalar(policy.value, policy.unit) : pricingPolicySummary(policy.key, policy.value);
const versionLabel = (version: number) => version ? 'Phiên bản ' + version + ' đang áp dụng' : 'Đang dùng thiết lập ban đầu';
const effectiveVersion = (policy: Policy) => policy.history.find(version => version.version === policy.effectiveVersion && version.status === 'EFFECTIVE');
const nextVersion = (policy: Policy) => policy.history.filter(version => version.status === 'SCHEDULED').sort((a, b) => Date.parse(a.effectiveFrom) - Date.parse(b.effectiveFrom))[0];

function Tabs({ id, label, tabs, current, onChange }: {
  id: string; label: string; tabs: typeof editorTabs; current: number; onChange: (index: number) => void;
}) {
  function navigate(event: KeyboardEvent<HTMLButtonElement>) {
    const positions: Record<string, number> = { ArrowLeft: (current + tabs.length - 1) % tabs.length, ArrowRight: (current + 1) % tabs.length, Home: 0, End: tabs.length - 1 };
    const index = positions[event.key];
    if (index === undefined) return;
    event.preventDefault();
    onChange(index);
    document.getElementById(id + '-tab-' + index)?.focus();
  }
  return <div className="policy-tabs" role="tablist" aria-label={label}>
    {tabs.map(({ label, icon: Icon }, index) => <button type="button" key={label} role="tab" id={id + '-tab-' + index} aria-controls={id + '-panel-' + index}
      aria-selected={index === current} tabIndex={index === current ? 0 : -1} onKeyDown={navigate} onClick={() => onChange(index)}>
      <Icon size={17} aria-hidden="true" />{label}
    </button>)}
  </div>;
}

function PolicyHistory({ policy }: { policy: Policy }) {
  if (!policy.history.length) return <div className="policy-empty policy-history-empty"><History size={20} aria-hidden="true" />
    <strong>Chưa có phiên bản được công bố.</strong>
    {policy.effectiveVersion === 0 && <p>Chính sách đang dùng thiết lập ban đầu.</p>}
  </div>;
  return <div className="policy-table-scroll"><table className="policy-table policy-history">
    <thead><tr><th>Phiên bản</th><th>Giá trị</th><th>Hiệu lực</th><th>Người tạo</th><th>Trạng thái</th></tr></thead>
    <tbody>{policy.history.map(version => <tr key={version.id}>
      <th scope="row">{version.version}</th>
      <td>{'unit' in policy ? scalar(Number(version.value), policy.unit) : pricingPolicySummary(policy.key, version.value as PricingPolicy['value'])}</td>
      <td>{formatTime(version.effectiveFrom)}{version.effectiveTo && <small>Đến {formatTime(version.effectiveTo)}</small>}</td>
      <td>{version.author ?? '—'}</td>
      <td><span className="policy-status" data-status={version.status}>{statuses[version.status] ?? version.status}</span></td>
    </tr>)}</tbody>
  </table></div>;
}

export function OperationsPolicies() {
  const { user } = useAuth();
  const resource = useApiResource<Catalog>(endpoint, user?.id);
  const [tab, setTab] = useState(0);
  const [selected, setSelected] = useState<Policy>();
  const [notice, setNotice] = useState('');
  const policies = new Map<string, Policy>([...(resource.data?.items ?? []), ...(resource.data?.pricing ?? [])].map(policy => [policy.key, policy]));
  const visible = groups[tab].keys.flatMap(key => policies.get(key) ?? []);
  const open = (policy: Policy) => { setNotice(''); setSelected(policy); };

  return <section className="policy-page">
    <header className="policy-page-heading">
      <h1>Chính sách kinh doanh</h1>
      <p>Quản lý các quy định thuê kho, thanh toán và hợp đồng.</p>
    </header>
    {notice && <p className="policy-notice" role="status">{notice}</p>}
    <div className="policy-catalog">
      <Tabs id="policy-group" label="Nhóm chính sách" tabs={groups} current={tab} onChange={setTab} />
      {groups.map((group, index) => <div key={group.label} role="tabpanel" id={'policy-group-panel-' + index} aria-labelledby={'policy-group-tab-' + index} hidden={tab !== index}>
        {tab === index && <>
          {resource.loading && <p className="policy-empty" role="status">Đang tải chính sách…</p>}
          {resource.error && <div className="policy-empty"><p role="alert">{resource.error}</p><button type="button" className="button-secondary" onClick={resource.refresh}><RefreshCw size={16} />Thử lại</button></div>}
          {!resource.loading && !resource.error && (visible.length ? <div className="policy-table-scroll"><table className="policy-table policy-catalog-table">
            <colgroup><col className="policy-col-name" /><col className="policy-col-value" /><col className="policy-col-date" /><col className="policy-col-action" /></colgroup>
            <thead><tr><th scope="col">Tên chính sách</th><th scope="col">Giá trị đang áp dụng</th><th scope="col">Hiệu lực từ (UTC+7)</th><th scope="col">Thao tác</th></tr></thead>
            <tbody>{visible.map(policy => {
              const effective = effectiveVersion(policy);
              const scheduled = nextVersion(policy);
              return <tr key={policy.key} onClick={() => open(policy)}>
                <th scope="row"><span>{policy.title}</span><small>{policy.description}</small></th>
                <td className="policy-active-value">{summary(policy)}</td>
                <td>{effective ? <time dateTime={effective.effectiveFrom}>Áp dụng từ {formatTime(effective.effectiveFrom)}</time> : versionLabel(policy.effectiveVersion)}
                  {effective && <small>{versionLabel(policy.effectiveVersion)}</small>}
                  {scheduled && <small className="policy-scheduled">Phiên bản {scheduled.version} sẽ áp dụng từ {formatTime(scheduled.effectiveFrom)}</small>}
                </td>
                <td><button type="button" className="button-secondary policy-edit" aria-label={'Chỉnh sửa ' + policy.title} onClick={event => { event.stopPropagation(); open(policy); }}><Pencil size={15} aria-hidden="true" />Chỉnh sửa</button></td>
              </tr>;
            })}</tbody>
          </table></div> : <p className="policy-empty">Nhóm này chưa có chính sách.</p>)}
        </>}
      </div>)}
    </div>
    {selected && <PolicyEditor key={selected.key} initial={selected} current={policies.get(selected.key) ?? selected}
      refreshing={resource.refreshing} refreshError={resource.error} onClose={() => setSelected(undefined)}
      onPublish={() => { setNotice('Đã công bố phiên bản mới của ' + selected.title + '.'); resource.refresh(); }} />}
  </section>;
}

function PolicyEditor({ initial, current, refreshing, refreshError, onClose, onPublish }: {
  initial: Policy; current: Policy; refreshing: boolean; refreshError: string; onClose: () => void; onPublish: () => void;
}) {
  const confirm = useConfirmation();
  const lock = useRef(false);
  const [tab, setTab] = useState(0);
  const [baseline, setBaseline] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [published, setPublished] = useState(false);
  const [validation, setValidation] = useState<Record<string, string>>({});
  const [revision, setRevision] = useState(0);
  const [[effectiveDate, effectiveTime], setEffective] = useState<[string, string]>(['', '']);
  const now = useCurrentTime(tab === 0, 1000);
  const stale = baseline.updatedAt !== current.updatedAt;
  const existing = effectiveVersion(current), scheduled = nextVersion(current);
  const earliest = Math.max(now, ...current.history.map(version => Date.parse(version.effectiveFrom)));
  const min = vietnamLocalMinute(earliest + 60_000);
  const effectiveFrom = effectiveDate && effectiveTime ? new Date(effectiveDate + 'T' + effectiveTime + ':00+07:00') : null;
  const invalidTime = effectiveFrom !== null && +effectiveFrom <= earliest;
  const timeProblem = invalidTime ? earliest > now
    ? 'Chọn thời điểm sau phiên bản đã lên lịch.' : 'Chọn thời điểm trong tương lai (UTC+7).' : '';
  const scroll = useRef<HTMLDivElement>(null);
  const duration = baseline.key === 'reservationHoldMinutes' && 'unit' in baseline ? baseline : null;
  function changeTab(index: number) {
    setTab(index);
    if (scroll.current) scroll.current.scrollTop = 0;
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || stale || !effectiveFrom || +effectiveFrom <= Math.max(Date.now(), earliest)) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const errors: Record<string, string> = {};
    for (const input of Array.from(form.querySelectorAll<HTMLInputElement>('input[name]'))) {
      if (!input.validity.valid) errors[input.name] = input.validity.valueMissing ? 'Hãy nhập giá trị.' :
        input.validity.stepMismatch ? 'Hãy nhập số nguyên.' : 'Giá trị ngoài phạm vi cho phép.';
    }
    const minutes = duration ? durationMinutes(String(fields.get('value')), String(fields.get('durationUnit'))) : null;
    if (duration && (minutes === null || !Number.isSafeInteger(minutes) || minutes < duration.min || minutes > duration.max)) {
      errors.value = 'Thời gian phải quy đổi thành số phút nguyên trong phạm vi ' + duration.min.toLocaleString('vi-VN') + '–' + duration.max.toLocaleString('vi-VN') + ' phút.';
    }
    const config = 'unit' in baseline ? null : readPricingPolicy(baseline.key, fields);
    if (config?.key === 'cancellation') {
      const value = config.value;
      if (value.farDays <= value.nearDays) errors.farDays = 'Mốc hoàn tiền sớm phải lớn hơn mốc gần ngày thuê.';
      if (value.middlePercent > value.farPercent) errors.middlePercent = 'Tỷ lệ không được cao hơn mốc trước.';
      if (value.nearPercent > value.middlePercent) errors.nearPercent = 'Tỷ lệ không được cao hơn mốc trước.';
      if (value.startedPercent > value.nearPercent) errors.startedPercent = 'Tỷ lệ không được cao hơn mốc trước.';
    }
    if (config?.key === 'paymentOverdue' || config?.key === 'returnOverdue') {
      if (config.value.managerDays < config.value.graceDays) errors.managerDays = 'Mốc chuyển quản lý phải bằng hoặc sau thời gian ân hạn.';
    }
    if (config?.key === 'renewal' && config.value.opensDaysBefore <= config.value.closesDaysBefore) {
      errors.opensDaysBefore = 'Phải mở gia hạn sớm hơn mốc đóng.';
    }
    setValidation(errors);
    const first = Object.keys(errors)[0];
    if (first) { form.querySelector<HTMLElement>('[name="' + first + '"]')?.focus(); return; }
    const value = config ? config.value : minutes ?? Number(fields.get('value'));
    const next = config ? pricingPolicySummary(config.key, config.value) : 'unit' in baseline ? scalar(Number(value), baseline.unit) : '';
    lock.current = true;
    setError('');
    try {
      if (!await confirm({
        title: 'Xem trước và công bố chính sách',
        description: [baseline.title, 'Hiện tại · ' + summary(baseline), 'Phiên bản mới · ' + next,
          'Hiệu lực từ ' + effectiveTime + ', ' + effectiveDate.split('-').reverse().join('/') + ' (UTC+7)', baseline.description].join('\n'),
        confirmLabel: 'Công bố phiên bản',
      })) return;
      if (+effectiveFrom <= Date.now()) {
        setError('Thời điểm hiệu lực đã qua. Hãy chọn lại.');
        return;
      }
      setBusy(true);
      await apiRequest(endpoint + '/' + baseline.key, { method: 'PATCH', body: JSON.stringify({ value, expectedUpdatedAt: baseline.updatedAt, effectiveFrom: effectiveFrom.toISOString() }) });
      setPublished(true);
      changeTab(1);
      onPublish();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Chưa công bố được chính sách.'); }
    finally { lock.current = false; setBusy(false); }
  }

  return <Modal title={initial.title} subtitle={<p>{initial.description}</p>} focusTitle busy={busy} onClose={onClose} className={'policy-editor ' + ('unit' in initial ? 'policy-editor-simple' : 'policy-editor-complex')}
    footer={<>
      <button type="button" className="button-secondary" disabled={busy} onClick={onClose}>{tab === 0 ? 'Hủy' : 'Đóng'}</button>
      {tab === 0 && <button type="submit" className="button-primary" form="policy-edit-form" disabled={busy || stale || !effectiveFrom || invalidTime}>{busy ? 'Đang công bố…' : 'Xem trước thay đổi'}</button>}
    </>}>
    <Tabs id="policy-editor" label="Chi tiết chính sách" tabs={editorTabs} current={tab} onChange={index => { if (!busy) changeTab(index); }} />
    <div className="policy-editor-scroll" ref={scroll} onPointerDown={event => {
      if (!(event.target instanceof HTMLElement)) return;
      const target = event.target.closest('input,select') ?? event.target.closest('label')?.querySelector('input,select');
      target?.setAttribute('data-policy-pointer', '');
    }} onBlur={event => event.target.removeAttribute('data-policy-pointer')}
      onKeyDown={event => { if (event.target instanceof HTMLElement) event.target.removeAttribute('data-policy-pointer'); }}>
    <div role="tabpanel" id="policy-editor-panel-0" aria-labelledby="policy-editor-tab-0" hidden={tab !== 0}>
      <div className="policy-current"><span>Giá trị đang áp dụng</span><div className="policy-current-value">{summary(current).split('\n').map(line => <div key={line}>{line}</div>)}</div>
        <small>{versionLabel(current.effectiveVersion)}{existing && ' · Áp dụng từ ' + formatTime(existing.effectiveFrom) + ' (UTC+7)'}</small>
        {scheduled && <small>Phiên bản {scheduled.version} đã lên lịch · {formatTime(scheduled.effectiveFrom)} (UTC+7)</small>}
      </div>
      {stale && <p className="policy-update" role="status">Đã có phiên bản mới. <button type="button" className="button-secondary" onClick={() => {
        setBaseline(current); setError(''); setValidation({}); setEffective(['', '']); setRevision(value => value + 1);
      }}>Dùng cấu hình mới nhất</button></p>}
      <form key={revision} id="policy-edit-form" className="policy-form" noValidate onSubmit={publish} onChange={event => {
        const field = event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement ? event.target.name : '';
        if (field && validation[field]) setValidation(previous => ({ ...previous, [field]: '' }));
      }}>
        <fieldset className="policy-form-fields" disabled={busy || stale}>
          {!('unit' in baseline) && <legend>Giá trị mới</legend>}
          <div className={'unit' in baseline ? 'policy-field-stack' : 'policy-field-grid'}>
            {duration ? <DurationField minutes={duration.value} min={duration.min} max={duration.max} error={validation.value} /> : 'unit' in baseline ? <label className="policy-field">Giá trị mới
              <span className="policy-input-unit"><input name="value" type="number" min={baseline.min} max={baseline.max} step={1} required defaultValue={baseline.value} aria-invalid={Boolean(validation.value)} aria-describedby="policy-value-note" /><span>{baseline.unit}</span></span>
              <small id="policy-value-note">Phạm vi {baseline.min.toLocaleString('vi-VN')}–{baseline.max.toLocaleString('vi-VN')} {baseline.unit}</small>
              {validation.value && <small className="policy-field-error">{validation.value}</small>}
            </label> : <PricingPolicyFields policy={baseline} errors={validation} />}
          </div>
          <fieldset className="policy-effective"><legend>Bắt đầu hiệu lực <span> (UTC+7)</span></legend>
            <div className="policy-field-grid">
              <DatePicker label="Ngày hiệu lực" required value={effectiveDate} min={min.slice(0, 10)}
                onChange={date => setEffective([date, effectiveTime])} />
              <TimePicker label="Giờ hiệu lực" required min={effectiveDate === min.slice(0, 10) ? min.slice(11) : undefined}
                error={timeProblem} onChange={clock => setEffective([effectiveDate, clock])} />
            </div>
            {!effectiveFrom && <small className="policy-muted">Chọn ngày và giờ hiệu lực để xem trước thay đổi.</small>}
          </fieldset>
        </fieldset>
        {error && <p className="policy-field-error" role="alert">{error}</p>}
      </form>
    </div>
    <div role="tabpanel" id="policy-editor-panel-1" aria-labelledby="policy-editor-tab-1" hidden={tab !== 1}>
      {published && <p className="policy-notice" role="status">Đã công bố phiên bản mới.</p>}
      {refreshing && <p className="policy-empty" role="status">Đang cập nhật lịch sử…</p>}
      {refreshError && <p className="policy-field-error" role="alert">{refreshError}</p>}
      <PolicyHistory policy={current} />
    </div>
    </div>
  </Modal>;
}

