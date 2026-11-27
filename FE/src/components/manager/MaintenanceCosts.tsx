import { useRef, useState, type FormEvent } from 'react';
import { DetailDisclosure } from '../workspace/DetailDisclosure';
import { date, first, object, rows, type Row } from './portal-data';
import { Facts, LoadState } from './PortalUi';
import { mutate } from '../../services/portal';
import { useApiResource } from '../../services/useApiResource';

const currency = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
export const maintenanceMoney = (value: unknown) =>
  typeof value === 'string' && /^-?\d+$/.test(value) ? currency.format(BigInt(value)) : 'Chưa xác định';

function repairMethod(value: unknown) {
  return value === 'INTERNAL' ? 'Nội bộ' : value === 'EXTERNAL' ? 'Thuê ngoài' : '';
}

export function MaintenanceRepairFacts({ row }: { row: Row }) {
  const repair = object(row.repair);
  if (!repair.method) return null;
  return <section className="manager-section">
    <h2>Khảo sát và phương án sửa chữa</h2>
    <Facts items={[[ 'Hình thức', repairMethod(repair.method) ], ['Khảo sát', first(repair, 'surveyResult')], ['Phương án', first(repair, 'plan')]]} />
  </section>;
}

const historyActions: Record<string, string> = {
  MAINTENANCE_REPAIR_PLANNED: 'Lưu khảo sát và phương án',
  MAINTENANCE_COST_PROPOSED: 'Gửi chi phí thực tế',
  MAINTENANCE_COST_CONFIRMED: 'Xác nhận chi phí',
  MAINTENANCE_COST_RETURNED: 'Trả lại kết quả để sửa tiếp',
  MAINTENANCE_COST_ADJUSTED: 'Điều chỉnh chi phí đã xác nhận',
};

export function MaintenanceCosts({ row, refresh, onSuccess }: { row: Row; refresh: () => void; onSuccess: (message: string) => void }) {
  const repair = object(row.repair);
  const costs = object(row.costs);
  const id = first(row, 'id');
  const root = '/manager/maintenance/' + encodeURIComponent(id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const lock = useRef(false);
  const history = useApiResource<Row[]>(root + '/cost-history', id);
  const completed = row.status === 'COMPLETED';
  const pending = costs.status === 'PENDING';
  const confirmed = costs.status === 'CONFIRMED';
  const proposals = rows(row.evidenceSubmissions).filter(item => item.maintenanceCostVnd != null);
  const selectedTotal = proposals.length ? proposals.filter(item => selectedIds.includes(first(item, 'id')))
    .reduce((sum, item) => sum + BigInt(String(item.maintenanceCostVnd)), 0n) : BigInt(String(costs.actualVnd ?? '0'));
  const evidenceLinks = Array.isArray(costs.evidenceLinks)
    ? costs.evidenceLinks.filter((value): value is string => typeof value === 'string' && /^https:\/\//i.test(value)) : [];

  async function save(event: FormEvent<HTMLFormElement>, action: 'plan' | 'confirm' | 'adjust') {
    event.preventDefault();
    if (lock.current) return;
    const form = new FormData(event.currentTarget);
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      if (action === 'confirm') {
        await mutate(root + '/confirm-cost', 'POST', {
          expectedActualVnd: costs.actualVnd, submissionIds: selectedIds,
        }, true);
      } else if (action === 'adjust') {
        await mutate(root + '/adjust-cost', 'PATCH', {
          actualCostVnd: form.get('actualCostVnd'), reason: form.get('reason'), expectedUpdatedAt: row.updatedAt,
        }, true);
      } else {
        await mutate(root + '/repair-plan', 'PATCH', {
          surveyResult: form.get('surveyResult'), repairMethod: form.get('repairMethod'), repairPlan: form.get('repairPlan'),
          expectedUpdatedAt: row.updatedAt,
        }, true);
      }
      onSuccess(action === 'confirm' ? 'Đã xác nhận chi phí bảo trì.' : action === 'adjust' ? 'Đã lưu điều chỉnh chi phí.' : 'Đã lưu khảo sát và phương án.');
      refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Chưa lưu được thông tin.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return <section className="manager-section">
    <h2>Chi phí bảo trì</h2>
    <Facts items={[
      ['Tình trạng chi phí', confirmed ? 'Đã xác nhận' : pending ? 'Chờ xác nhận' : 'Chưa ghi nhận'],
      [pending ? 'Tổng đề xuất' : 'Chi phí thực tế', maintenanceMoney(costs.actualVnd)],
      ...(confirmed ? [
        ['Người xác nhận', first(costs, 'confirmedBy')], ['Ngày xác nhận', date(costs.confirmedAt, true)],
      ] as [string, string][] : []),
    ]} />
    {evidenceLinks.length > 0 && <ul>{evidenceLinks.map((link, index) => <li key={link}>
      <a href={link} target="_blank" rel="noopener noreferrer">Mở chứng từ {index + 1}</a>
    </li>)}</ul>}
    {error && <p className="portal-error" role="alert">{error}</p>}
    {!completed && <DetailDisclosure title={repair.method ? 'Sửa khảo sát và phương án' : 'Ghi nhận khảo sát và phương án'}>
      <form className="portal-form" onSubmit={event => void save(event, 'plan')}>
        <label className="field-label">Kết quả khảo sát<textarea name="surveyResult" required maxLength={4000} rows={2} defaultValue={first(repair, 'surveyResult')} /></label>
        <label className="field-label">Hình thức sửa chữa<select name="repairMethod" required defaultValue={first(repair, 'method')}>
          <option value="">Chọn hình thức</option><option value="INTERNAL">Nội bộ</option><option value="EXTERNAL">Thuê ngoài</option>
        </select></label>
        <label className="field-label">Phương án sửa chữa<textarea name="repairPlan" required maxLength={4000} rows={2} defaultValue={first(repair, 'plan')} /></label>
        <button className="button-secondary" disabled={busy}>Lưu phương án</button>
      </form>
    </DetailDisclosure>}
    {completed && pending && <form className="portal-form portal-form-divider incident-booking-impact" onSubmit={event => void save(event, 'confirm')}>
      {proposals.length > 0 && <fieldset className="incident-booking-group">
        <legend>Chọn khoản chi phí hợp lệ</legend>
        <div className="incident-booking-choices">{proposals.map(item => {
          const submissionId = first(item, 'id');
          return <label key={submissionId} className="incident-booking-choice">
            <input type="checkbox" checked={selectedIds.includes(submissionId)} disabled={busy} onChange={event => {
              const checked = event.target.checked;
              setSelectedIds(ids => checked ? [...ids, submissionId] : ids.filter(id => id !== submissionId));
            }} />
            <span><strong>{maintenanceMoney(item.maintenanceCostVnd)}</strong>
              <small>{date(item.recordedAt, true)}{item.maintenanceRejectedAt ? ' · Lần sửa bị trả lại' : ''}</small>
            </span>
          </label>;
        })}</div>
        <p>Tổng được chọn <strong>{maintenanceMoney(selectedTotal.toString())}</strong></p>
      </fieldset>}
      <button className="button-primary" disabled={busy || (proposals.length > 0 && !selectedIds.length)}>Xác nhận chi phí thực tế</button>
    </form>}
    {confirmed && <DetailDisclosure title="Điều chỉnh chi phí đã xác nhận">
      <form className="portal-form" onSubmit={event => void save(event, 'adjust')}>
        <p>Số mới được cập nhật vào kỳ xác nhận lần đầu.</p>
        <label className="field-label">Chi phí sau điều chỉnh (VND)
          <input name="actualCostVnd" required inputMode="numeric" pattern="[0-9]{1,18}" maxLength={18} defaultValue={first(costs, 'actualVnd')} />
        </label>
        <label className="field-label">Lý do điều chỉnh<textarea name="reason" required minLength={3} maxLength={4000} rows={2} /></label>
        <button className="button-secondary" disabled={busy}>Lưu điều chỉnh</button>
      </form>
    </DetailDisclosure>}
    <DetailDisclosure title="Lịch sử chi phí">
      <LoadState loading={history.loading} error={history.error} retry={history.refresh} />
      {history.data?.length === 0 && <p>Chưa có thay đổi.</p>}
      <ul className="record-note">{history.data?.map(item => {
        const data = object(item.metadata);
        const hasCost = item.action !== 'MAINTENANCE_REPAIR_PLANNED';
        const amounts = item.action === 'MAINTENANCE_COST_ADJUSTED'
          ? maintenanceMoney(object(data.before).actualVnd) + ' → ' + maintenanceMoney(object(data.after).actualVnd)
          : maintenanceMoney(data.actualVnd);
        return <li key={first(item, 'id')}><strong>{historyActions[first(item, 'action')]}</strong>
          <p>{first(item, 'actorName')} · {date(item.createdAt, true)}{hasCost && ` · ${amounts}`}</p>
          {first(data, 'reason') && <p>{first(data, 'reason')}</p>}
        </li>;
      })}</ul>
    </DetailDisclosure>
  </section>;
}
