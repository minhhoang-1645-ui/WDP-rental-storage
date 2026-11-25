import { useRef, useState, type FormEvent } from 'react';
import { History, Pencil, RefreshCw } from 'lucide-react';
import { useAuth } from '../../auth/auth-context';
import { Empty, LoadState, Modal, PageHeader, RefreshStatus } from '../../components/manager/PortalUi';
import { money } from '../../components/manager/portal-data';
import { useConfirmation } from '../../components/workspace/ConfirmationProvider';
import { DateTimePicker } from '../../components/workspace/DateTimeFields';
import { useCurrentTime } from '../../hooks/useCurrentTime';
import { apiRequest } from '../../services/api';
import { useApiResource } from '../../services/useApiResource';
import { vietnamLocalMinute } from '../../utils/handover';
import './operations-pricing.css';

type Bounds = { min: number; max: number };
type Facility = { id: string; name: string; code: string };
type Range = { id: string; facilityId: string; storageTypeId: string | null; sizeId: string | null; version: number;
  value: Bounds; effectiveFrom: string; status: keyof typeof statuses; legacy: boolean; author: string | null };
type StorageType = { id: string; facilityId: string; sizeId: string; code: string; name: string; monthlyRate: number | null };
type Pricing = { groups: Record<string, string>; items: Range[]; types: StorageType[] };
const endpoint = '/operations/pricing-rules';
const maximum = 9_999_999_999;
const statuses = { EFFECTIVE: 'Đang áp dụng', SCHEDULED: 'Chờ hiệu lực', HISTORICAL: 'Hết hiệu lực' };
const fromDate = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric', hourCycle: 'h23' });
const outside = (price: number | null, range: Bounds) => price === null || price <= 0 || price < range.min || price > range.max;
const format = (range?: Bounds | null) => range ? money(range.min) + ' – ' + money(range.max) : 'Chưa thiết lập';
const byEffective = (a: Range, b: Range) => Date.parse(a.effectiveFrom) - Date.parse(b.effectiveFrom);

export function OperationsPricing() {
  const { user } = useAuth();
  const rules = useApiResource<Pricing>(endpoint, user?.id);
  const facilities = useApiResource<Facility[]>('/operations/facilities', user?.id);
  const [facilityId, setFacilityId] = useState('');
  const [dialog, setDialog] = useState<{ kind: 'edit' | 'history' | 'legacy'; sizeId: string }>();
  const [notice, setNotice] = useState('');
  const facility = facilities.data?.find(item => item.id === facilityId) ?? facilities.data?.[0];
  const pricing = rules.data;
  const types = pricing?.types.filter(item => item.facilityId === facility?.id) ?? [];
  const legacy = pricing?.items.filter(item => item.facilityId === facility?.id && item.legacy) ?? [];
  const groups = Object.entries(pricing?.groups ?? {}).map(([sizeId, label]) => {
    const versions = (pricing?.items.filter(item => item.facilityId === facility?.id && item.sizeId === sizeId) ?? []).sort(byEffective);
    const current = versions.find(item => item.status === 'EFFECTIVE');
    const scheduled = versions.filter(item => item.status === 'SCHEDULED');
    const storage = types.filter(item => item.sizeId === sizeId);
    const legacyRanges = legacy.filter(item => item.status === 'EFFECTIVE' && (!item.storageTypeId || storage.some(type => type.id === item.storageTypeId)));
    const legacyConflict = new Set(legacyRanges.map(item => JSON.stringify([item.value?.min, item.value?.max]))).size > 1;
    const reviews = storage.flatMap(item => {
      const pending = scheduled.find(version => outside(item.monthlyRate, version.value));
      return !current || outside(item.monthlyRate, current.value) || pending ? [{ item, current, pending }] : [];
    });
    return { sizeId, label, versions, current, scheduled, storage, legacyConflict, reviews };
  });
  const selected = groups.find(group => group.sizeId === dialog?.sizeId);
  const reviews = groups.flatMap(group => group.reviews.map(review => ({ ...review, group: group.label })));

  return <section className="bom-pricing">
    <PageHeader title="Khung giá thuê">
      <RefreshStatus active={rules.refreshing} />
      <button type="button" className="button-secondary" disabled={rules.loading || rules.refreshing} onClick={() => { rules.refresh(); facilities.refresh(); }}><RefreshCw size={16} /> Làm mới</button>
    </PageHeader>
    <LoadState loading={facilities.loading || rules.loading} error={rules.error || facilities.error} retry={() => { rules.refresh(); facilities.refresh(); }} />
    {notice && <p role="status">{notice}</p>}
    {facility && pricing ? <>
      <div className="portal-toolbar bom-pricing-filters">
        <label className="field-label">Cơ sở<select aria-label="Cơ sở" value={facility.id} onChange={event => { setFacilityId(event.target.value); setNotice(''); }}>
          {facilities.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        {legacy.length > 0 && <button type="button" className="button-secondary" onClick={() => setDialog({ kind: 'legacy', sizeId: '' })}><History size={16} /> Lịch sử khung giá cũ</button>}
      </div>
      <div className="manager-table-wrap bom-pricing-table">
        <table className="manager-table" aria-label="Khung giá theo nhóm kho">
          <thead><tr><th>Nhóm kho</th><th>Tối thiểu / tháng</th><th>Tối đa / tháng</th><th>Loại kho</th><th>Cần xem lại</th><th>Hiệu lực từ</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
          <tbody>{groups.map(group => {
            const version = group.current ?? group.scheduled[0];
            return <tr key={group.sizeId}>
              <th scope="row">{group.label}</th>
              <td>{version ? money(version.value.min) : '—'}</td><td>{version ? money(version.value.max) : '—'}</td>
              <td>{group.storage.length}</td><td>{group.reviews.length}</td><td>{version ? fromDate.format(new Date(version.effectiveFrom)) : '—'}</td>
              <td>{version ? statuses[version.status] : group.legacyConflict ? 'Cần BOM thiết lập lại' : 'Chưa thiết lập'}
                {group.current && group.scheduled.length > 0 && <small>Có phiên bản chờ hiệu lực</small>}</td>
              <td><div className="bom-pricing-actions">
                <button type="button" className="button-secondary" onClick={() => setDialog({ kind: 'edit', sizeId: group.sizeId })}><Pencil size={15} />{version ? 'Chỉnh sửa' : 'Thiết lập'}</button>
                <button type="button" className="button-secondary" aria-label={'Lịch sử ' + group.label} onClick={() => setDialog({ kind: 'history', sizeId: group.sizeId })}><History size={15} /></button>
              </div></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <section className="manager-section">
        <h2>Loại kho cần điều chỉnh giá</h2>
        {reviews.length ? <div className="manager-table-wrap bom-pricing-table"><table className="manager-table">
          <thead><tr><th>Cơ sở / Loại kho</th><th>Nhóm kho</th><th>Giá hiện tại</th><th>Khung đang áp dụng</th><th>Lý do</th></tr></thead>
          <tbody>{reviews.map(({ item, current, pending, group }) => <tr key={item.id}>
            <td><strong>{item.name}</strong><small>{facility.name} · {item.code}</small></td><td>{group}</td>
            <td>{item.monthlyRate === null ? 'Chưa có giá' : money(item.monthlyRate)}</td><td>{format(current?.value)}</td>
            <td>{!current ? 'Nhóm chưa có khung giá đang hiệu lực' : outside(item.monthlyRate, current.value) ? 'Giá đang ngoài khung' : 'Giá hiện tại hợp lệ'}
              {pending && <small>Sẽ ngoài khung {format(pending.value)} từ {fromDate.format(new Date(pending.effectiveFrom))}</small>}</td>
          </tr>)}</tbody>
        </table></div> : <p>Không có loại kho cần điều chỉnh giá.</p>}
      </section>
      {dialog?.kind === 'edit' && selected && <RangeEditor facility={facility} group={selected} onClose={() => setDialog(undefined)} onSaved={() => {
        setDialog(undefined); setNotice('Đã công bố phiên bản khung giá.'); rules.refresh();
      }} />}
      {dialog && (dialog.kind === 'legacy' || dialog.kind === 'history' && selected) && <Modal title={selected ? 'Lịch sử khung giá · ' + selected.label : 'Lịch sử khung giá cũ'}
        className="bom-pricing-history" onClose={() => setDialog(undefined)} focusTitle
        footer={<button type="button" className="button-secondary" onClick={() => setDialog(undefined)}>Đóng</button>}>
        {dialog.kind === 'legacy' && <p>Khung theo toàn cơ sở hoặc theo loại kho được lưu để đối chiếu. Giao dịch mới sử dụng khung theo nhóm kho.</p>}
        <PriceHistory items={selected?.versions ?? legacy} types={types} />
      </Modal>}
    </> : !facilities.loading && !rules.loading && !facilities.error && !rules.error && <Empty title="Chưa có cơ sở" />}
  </section>;
}

function PriceHistory({ items, types }: { items: Range[]; types: StorageType[] }) {
  if (!items.length) return <p>Chưa có phiên bản đã công bố.</p>;
  return <div className="manager-table-wrap bom-pricing-table"><table className="manager-table">
    <thead><tr><th>Phiên bản</th><th>Khung giá / tháng</th><th>Hiệu lực từ</th><th>Người công bố</th><th>Trạng thái</th></tr></thead>
    <tbody>{[...items].sort((a, b) => byEffective(b, a)).map(item => <tr key={item.id}>
      <td>{item.version}{item.legacy && <small>{item.storageTypeId ? types.find(type => type.id === item.storageTypeId)?.name ?? item.storageTypeId : 'Toàn cơ sở'}</small>}</td>
      <td>{format(item.value)}</td><td>{fromDate.format(new Date(item.effectiveFrom))}</td><td>{item.author ?? '—'}</td>
      <td>{item.legacy ? 'Khung cũ' : statuses[item.status]}</td>
    </tr>)}</tbody>
  </table></div>;
}

function RangeEditor({ facility, group, onClose, onSaved }: { facility: Facility; group: { label: string; sizeId: string;
  versions: Range[]; current?: Range; storage: StorageType[] }; onClose: () => void; onSaved: () => void }) {
  const confirm = useConfirmation();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const latest = group.versions.at(-1);
  const now = useCurrentTime();
  const minimum = vietnamLocalMinute(Math.max(now, latest ? Date.parse(latest.effectiveFrom) : 0) + 60_000);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const fields = new FormData(event.currentTarget);
    const min = Number(fields.get('min')), max = Number(fields.get('max'));
    if (min > max) { setError('Giá tối thiểu không được lớn hơn giá tối đa.'); return; }
    const date = new Date(String(fields.get('effectiveFrom')) + ':00+07:00');
    if (!Number.isFinite(+date) || +date <= Date.now() || latest && +date <= Date.parse(latest.effectiveFrom)) {
      setError('Chọn thời điểm trong tương lai và sau phiên bản gần nhất.'); return;
    }
    lock.current = true;
    setError('');
    try {
      const affected = group.storage.filter(type => outside(type.monthlyRate, { min, max })).map(type => type.name);
      if (!await confirm({ title: 'Công bố khung giá', confirmLabel: 'Công bố', description: [
        facility.name + ' · ' + group.label, 'Khung đang áp dụng · ' + format(group.current?.value), 'Khung mới · ' + format({ min, max }),
        'Hiệu lực · ' + fromDate.format(date) + ' (UTC+7)', affected.length ? 'Loại kho cần điều chỉnh · ' + affected.join(', ') : 'Không có loại kho ngoài khung mới.',
      ].join('\n') })) return;
      if (+date <= Date.now()) { setError('Thời điểm hiệu lực đã qua. Hãy chọn lại.'); return; }
      setBusy(true);
      await apiRequest(endpoint, { method: 'POST', body: JSON.stringify({
        facilityId: facility.id, sizeId: group.sizeId, min, max, effectiveFrom: date.toISOString(), expectedVersion: latest?.version ?? 0,
      }) });
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Chưa công bố được khung giá.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Modal title={latest ? 'Chỉnh sửa khung giá' : 'Thiết lập khung giá'} subtitle={<p>{facility.name} · {group.label}</p>}
    className="bom-pricing-dialog" onClose={onClose} busy={busy} focusTitle footer={<>
      <button type="button" className="button-secondary" disabled={busy} onClick={onClose}>Hủy</button>
      <button type="submit" className="button-primary" form="bom-price-edit" disabled={busy}>{busy ? 'Đang công bố…' : 'Xem trước thay đổi'}</button>
    </>}>
    <form id="bom-price-edit" className="bom-pricing-form" onSubmit={save}>
      <div className="bom-pricing-amounts">
        <label className="field-label">Giá tháng tối thiểu (VND)<input name="min" type="number" min={0} max={maximum} step={1} required defaultValue={latest?.value.min} /></label>
        <label className="field-label">Giá tháng tối đa (VND)<input name="max" type="number" min={0} max={maximum} step={1} required defaultValue={latest?.value.max} /></label>
      </div>
      <DateTimePicker label="Hiệu lực (UTC+7)" name="effectiveFrom" min={minimum} required />
      {error && <p className="booking-alert is-error" role="alert">{error}</p>}
    </form>
  </Modal>;
}
