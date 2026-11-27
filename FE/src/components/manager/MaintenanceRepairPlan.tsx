import { useRef, useState, type FormEvent } from 'react';
import { mutate } from '../../services/portal';
import { DetailDisclosure } from '../workspace/DetailDisclosure';
import { Facts } from './PortalUi';
import { date, first, object, rows, type Row } from './portal-data';

export const maintenanceAssignmentHint = 'Vui lòng hoàn thành khảo sát và lưu phương án xử lý trước khi phân công nhân viên.';

function repairMethod(value: unknown) {
  return value === 'INTERNAL' ? 'Nội bộ' : value === 'EXTERNAL' ? 'Thuê ngoài' : '';
}

export function MaintenanceRepairPlan({ row, refresh, onSuccess }: {
  row: Row;
  refresh?: () => void;
  onSuccess?: (message: string) => void;
}) {
  const repair = object(row.repair);
  const planReady = row.repairPlanReady === true;
  const editable = Boolean(refresh) && row.status !== 'COMPLETED';
  const lastPlan = rows(row.history).find(event => event.action === 'MAINTENANCE_REPAIR_PLANNED');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editable || lock.current) return;
    const form = new FormData(event.currentTarget);
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await mutate('/manager/maintenance/' + encodeURIComponent(first(row, 'id')) + '/repair-plan', 'PATCH', {
        surveyResult: form.get('surveyResult'), repairMethod: form.get('repairMethod'), repairPlan: form.get('repairPlan'),
        expectedUpdatedAt: row.updatedAt,
      }, true);
      onSuccess?.('Đã lưu khảo sát và phương án.');
      refresh?.();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Chưa lưu được phương án.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return <section className="manager-section">
    <h2>Khảo sát và phương án xử lý</h2>
    {planReady || repair.surveyResult ? <Facts items={[
      ['Kết quả khảo sát', first(repair, 'surveyResult')],
      ['Hình thức sửa chữa', repairMethod(repair.method)],
      ['Phương án sửa chữa', first(repair, 'plan')],
      ...(lastPlan ? [
        ['Người lưu', first(lastPlan, 'actorName')], ['Lưu lúc', date(lastPlan.createdAt, true)],
      ] as [string, string][] : []),
    ]} /> : <p className="record-text">{editable ? 'Chưa lưu khảo sát và phương án.' : 'Chưa có phương án sửa chữa được lưu.'}</p>}
    {editable && <DetailDisclosure title={planReady ? 'Cập nhật phương án' : 'Nhập kết quả khảo sát và phương án'} open={!planReady || undefined}>
      <form className="portal-form" onSubmit={event => void save(event)}>
        <label className="field-label">Kết quả khảo sát
          <textarea name="surveyResult" required maxLength={4000} rows={2} defaultValue={first(repair, 'surveyResult')} />
        </label>
        <label className="field-label">Hình thức sửa chữa
          <select name="repairMethod" required defaultValue={first(repair, 'method')}>
            <option value="">Chọn hình thức</option><option value="INTERNAL">Nội bộ</option><option value="EXTERNAL">Thuê ngoài</option>
          </select>
        </label>
        <label className="field-label">Phương án sửa chữa
          <textarea name="repairPlan" required maxLength={4000} rows={2} defaultValue={first(repair, 'plan')} />
        </label>
        {error && <p className="portal-error" role="alert">{error}</p>}
        <button className="button-primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu phương án'}</button>
      </form>
    </DetailDisclosure>}
  </section>;
}

const historyLabels: Record<string, string> = {
  MAINTENANCE_REPAIR_PLANNED: 'Lưu khảo sát và phương án',
  TASK_ASSIGNMENT: 'Cập nhật phân công',
  TASK_STAFF_COMPLETED: 'Gửi kết quả sửa chữa',
  INCIDENT_VERIFIED: 'Nghiệm thu',
  INCIDENT_VERIFICATION_REJECTED: 'Yêu cầu sửa lại',
  INCIDENT_CLOSED_WITHOUT_REPAIR: 'Đóng phiếu không cần sửa',
  MAINTENANCE_COST_ADJUSTED: 'Điều chỉnh chi phí',
};

export function MaintenanceProcessingHistory({ row }: { row: Row }) {
  return <DetailDisclosure title="Lịch sử xử lý">
    <ol className="record-note">
      {rows(row.history).map(event => {
        const detail = object(event.metadata);
        return <li key={first(event, 'id')}>
          <strong>{historyLabels[first(event, 'action')]}</strong>
          <p>{first(event, 'actorName')} · {date(event.createdAt, true)}</p>
          {event.action === 'MAINTENANCE_REPAIR_PLANNED' && <Facts items={[
            ['Khảo sát', first(detail, 'surveyResult')], ['Hình thức', repairMethod(detail.repairMethod)],
            ['Phương án', first(detail, 'repairPlan')],
          ]} />}
          {first(detail, 'note', 'reason') && <p>{first(detail, 'note', 'reason')}</p>}
        </li>;
      })}
      <li><strong>Báo cáo sự cố</strong><p>{first(row, 'reportedBy.fullName')} · {date(row.createdAt, true)}</p></li>
    </ol>
  </DetailDisclosure>;
}
