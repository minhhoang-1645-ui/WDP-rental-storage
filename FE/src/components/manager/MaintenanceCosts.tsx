import { useRef, useState, type FormEvent } from 'react';
import { DetailDisclosure } from '../workspace/DetailDisclosure';
import { date, first, object, rows, type Row } from './portal-data';
import { Facts, LoadState } from './PortalUi';
import { mutate } from '../../services/portal';
import { useApiResource } from '../../services/useApiResource';
import { MaintenanceRepairFiles } from './MaintenanceRepairFiles';

const currency = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
export const maintenanceMoney = (value: unknown) =>
  typeof value === 'string' && /^-?\d+$/.test(value) ? currency.format(BigInt(value)) : 'Chưa xác định';

const historyActions: Record<string, string> = {
  MAINTENANCE_COST_PROPOSED: 'Gửi chi phí thực tế',
  MAINTENANCE_COST_CONFIRMED: 'Xác nhận chi phí',
  MAINTENANCE_COST_RETURNED: 'Trả lại kết quả để sửa tiếp',
  MAINTENANCE_COST_ADJUSTED: 'Điều chỉnh chi phí đã xác nhận',
};

export function MaintenanceCosts({ row, refresh, onSuccess }: { row: Row; refresh: () => void; onSuccess: (message: string) => void }) {
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
  const submissions = rows(row.evidenceSubmissions);
  const proposals = submissions.filter(item => item.maintenanceCostVnd != null);
  const receiptSubmissions = submissions.filter(item => rows(item.repairAttachments).some(file => file.kind === 'RECEIPT'));
  const proposedTotal = proposals.reduce((sum, item) => sum + BigInt(String(item.maintenanceCostVnd)), 0n);
  const selectedTotal = proposals.length ? proposals.filter(item => selectedIds.includes(first(item, 'id')))
    .reduce((sum, item) => sum + BigInt(String(item.maintenanceCostVnd)), 0n) : BigInt(String(costs.actualVnd ?? '0'));
  const evidenceLinks = Array.isArray(costs.evidenceLinks)
    ? costs.evidenceLinks.filter((value): value is string => typeof value === 'string' && /^https:\/\//i.test(value)) : [];

  async function save(event: FormEvent<HTMLFormElement>, action: 'confirm' | 'adjust') {
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
      } else {
        await mutate(root + '/adjust-cost', 'PATCH', {
          actualCostVnd: form.get('actualCostVnd'), reason: form.get('reason'), expectedUpdatedAt: row.updatedAt,
        }, true);
      }
      onSuccess(action === 'confirm' ? 'Đã xác nhận chi phí bảo trì.' : 'Đã lưu điều chỉnh chi phí.');
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
      ['Chi phí Staff báo cáo', maintenanceMoney(proposals.length ? proposedTotal.toString() : confirmed ? undefined : costs.actualVnd)],
      ...(confirmed ? [
        ['Chi phí thực tế đã xác nhận', maintenanceMoney(costs.actualVnd)],
        ['Người xác nhận', first(costs, 'confirmedBy')], ['Ngày xác nhận', date(costs.confirmedAt, true)],
      ] as [string, string][] : []),
    ]} />
    {evidenceLinks.length > 0 && <ul>{evidenceLinks.map((link, index) => <li key={link}>
      <a href={link} target="_blank" rel="noopener noreferrer">Mở chứng từ {index + 1}</a>
    </li>)}</ul>}
    {receiptSubmissions.length > 0 && <DetailDisclosure title="Chứng từ theo lần sửa chữa">
      {receiptSubmissions.map(item => <div key={first(item, 'id')}>
        <p className="record-attribution">{date(item.recordedAt, true)} · {maintenanceMoney(item.maintenanceCostVnd)}</p>
        <MaintenanceRepairFiles record={id} submission={item} kind="RECEIPT" />
      </div>)}
    </DetailDisclosure>}
    {error && <p className="portal-error" role="alert">{error}</p>}
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
      {history.data?.every(item => !historyActions[first(item, 'action')]) && <p>Chưa có thay đổi.</p>}
      <ul className="record-note">{history.data?.filter(item => historyActions[first(item, 'action')]).map(item => {
        const data = object(item.metadata);
        const amounts = item.action === 'MAINTENANCE_COST_ADJUSTED'
          ? maintenanceMoney(object(data.before).actualVnd) + ' → ' + maintenanceMoney(object(data.after).actualVnd)
          : maintenanceMoney(data.actualVnd);
        return <li key={first(item, 'id')}><strong>{historyActions[first(item, 'action')]}</strong>
          <p>{first(item, 'actorName')} · {date(item.createdAt, true)}{item.action !== 'MAINTENANCE_COST_RETURNED' && ` · ${amounts}`}</p>
          {first(data, 'reason') && <p>{first(data, 'reason')}</p>}
        </li>;
      })}</ul>
    </DetailDisclosure>
  </section>;
}
