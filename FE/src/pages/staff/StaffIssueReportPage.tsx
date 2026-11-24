import { useEffect, useRef, useState, type FormEvent } from 'react';
import { date, first, label, type Row } from '../../components/manager/portal-data';
import { Empty, Facts, LoadState, PageHeader, Status } from '../../components/manager/PortalUi';
import { useAuth } from '../../auth/auth-context';
import { useConfirmation } from '../../components/workspace/ConfirmationProvider';
import { ApiError } from '../../services/api';
import { allPages, mutate } from '../../services/portal';
import { usePaginatedResource } from '../../services/usePaginatedResource';

type ReportUnit = {
  id: string;
  unitCode: string;
  status: string;
  storageType: { facility: { id: string; name: string } };
};

const categories = ['UNIT_DAMAGE', 'CLEANING', 'LOCK_OR_ACCESS', 'FACILITY_EQUIPMENT', 'OTHER'];
const priorities = ['LOW', 'MEDIUM', 'HIGH'];

export function StaffIssueReportPage() {
  const confirm = useConfirmation();
  const { user } = useAuth();
  const reports = usePaginatedResource<Row>(user ? '/staff/maintenance/reported-by-me' : null, user?.id, true);
  const lock = useRef(false);
  const [units, setUnits] = useState<ReportUnit[]>([]);
  const [formAvailable, setFormAvailable] = useState(false);
  const [revision, setRevision] = useState(0);
  const [facility, setFacility] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<Row>();

  useEffect(() => {
    const controller = new AbortController();
    void allPages<ReportUnit>('/staff/maintenance/units', controller.signal)
      .then(({ items }) => {
        if (controller.signal.aborted) return;
        setUnits(items);
        if (items.length) setFormAvailable(true);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setUnits([]);
        setLoadError(cause instanceof ApiError && cause.status === 403
          ? 'Bạn không có quyền tra cứu kho để báo sự cố.'
          : cause instanceof Error ? cause.message : 'Không tải được danh sách kho.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);

  const facilities = new Map(units.map(unit => [unit.storageType.facility.id, unit.storageType.facility]));
  const selectedFacility = facilities.has(facility) ? facility : facilities.size === 1 ? facilities.keys().next().value ?? '' : '';
  const facilityUnits = units.filter(unit => unit.storageType.facility.id === selectedFacility);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const unit = facilityUnits.find(item => item.id === values.get('unit'));
    const description = String(values.get('description') ?? '').trim();
    const evidenceLink = String(values.get('evidenceLink') ?? '').trim();
    setError('');
    setReceipt(undefined);
    if (!unit || description.length < 3) {
      setError('Hãy chọn kho và nhập mô tả có ít nhất 3 ký tự.');
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      if (!await confirm({
        title: 'Gửi báo cáo sự cố?',
        description: `Kho ${unit.unitCode} · ${unit.storageType.facility.name}`,
        confirmLabel: 'Gửi báo cáo',
      })) return;
      const result = await mutate('/staff/maintenance', 'POST', {
        storageUnitId: unit.id,
        category: values.get('category'),
        priority: values.get('priority'),
        description,
        ...(evidenceLink ? { evidenceLink } : {}),
      }, true);
      form.reset();
      setReceipt(result);
      reports.refresh();
    } catch (cause) {
      const denied = cause instanceof ApiError && [403, 404].includes(cause.status);
      setError(denied
        ? 'Bạn không còn quyền báo sự cố cho kho này.'
        : cause instanceof Error ? cause.message : 'Không gửi được báo cáo sự cố.');
      if (denied || cause instanceof ApiError && cause.status === 409) {
        setLoading(true);
        setRevision(value => value + 1);
        reports.refresh();
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return <section>
    <PageHeader title="Báo cáo sự cố" />
    <LoadState loading={loading} error={loadError} retry={() => {
      setLoading(true);
      setLoadError('');
      setRevision(value => value + 1);
    }} />
    {!loading && !loadError && !units.length && <Empty title="Chưa có kho để báo sự cố"
      description="Nếu thiếu cơ sở, hãy liên hệ quản trị viên để kiểm tra quyền truy cập." />}
    {formAvailable && <section className="manager-section">
      <form className="portal-form" onSubmit={submit} aria-busy={busy}>
        <fieldset className="portal-action-fieldset" disabled={busy}>
          <label className="field-label">Cơ sở
            <select required value={selectedFacility} onChange={event => setFacility(event.target.value)}>
              <option value="">Chọn cơ sở</option>
              {[...facilities.values()].map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="field-label">Kho
            <select key={selectedFacility} name="unit" required disabled={!selectedFacility}>
              <option value="">Chọn kho</option>
              {facilityUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.unitCode} · {label(unit.status)}</option>)}
            </select>
          </label>
          <label className="field-label">Loại sự cố
            <select name="category">{categories.map(value => <option key={value} value={value}>{label(value)}</option>)}</select>
          </label>
          <label className="field-label">Mức ưu tiên
            <select name="priority" defaultValue="MEDIUM">{priorities.map(value => <option key={value} value={value}>{label(value)}</option>)}</select>
          </label>
          <label className="field-label">Mô tả sự cố
            <textarea name="description" required minLength={3} maxLength={4000} rows={4} />
          </label>
          <label className="field-label">Liên kết ảnh (tùy chọn)
            <input name="evidenceLink" type="url" pattern="https://.+" maxLength={1000} placeholder="https://…" />
          </label>
          <button type="submit" className="button-primary" disabled={loading || Boolean(loadError) || !facilityUnits.length}>
            {busy ? 'Đang xử lý…' : 'Gửi báo cáo sự cố'}
          </button>
        </fieldset>
      </form>
      {error && <p className="booking-alert is-error" role="alert">{error}</p>}
      {receipt && <section className="manager-section">
        <p className="portal-success" role="status">Đã gửi báo cáo{first(receipt, 'maintenanceCode') && ` ${first(receipt, 'maintenanceCode')}`}</p>
        <Facts items={[
          ['Loại sự cố', first(receipt, 'category') ? label(receipt.category) : ''],
          ['Cơ sở', first(receipt, 'facility.name')],
          ['Kho', first(receipt, 'unit.unitCode')],
          ['Ngày báo', first(receipt, 'createdAt') ? date(receipt.createdAt, true) : ''],
          ['Trạng thái lúc gửi', first(receipt, 'status') === 'OPEN' && !receipt.assignedStaff
            ? 'Chờ quản lý phân công' : first(receipt, 'status') ? label(receipt.status) : ''],
          ['Nhân viên được giao', first(receipt, 'assignedStaff.fullName')],
        ].filter(([, value]) => Boolean(value)) as [string, string][]} />
      </section>}
    </section>}
    <section className="manager-section">
      <PageHeader title="Sự cố tôi đã báo">
        <button className="button-secondary" type="button" disabled={reports.loading || reports.refreshing}
          onClick={reports.refresh}>Làm mới danh sách</button>
      </PageHeader>
      <LoadState loading={reports.loading} error={reports.error} retry={reports.refresh} />
      {reports.data?.items.length === 0 && <Empty title="Chưa có sự cố đã báo" />}
      {Boolean(reports.data?.items.length) && <div className="manager-table-wrap">
        <table className="manager-table" aria-label="Sự cố tôi đã báo">
          <thead><tr><th>Phiếu sự cố</th><th>Cơ sở / Kho</th><th>Ngày báo</th><th>Người xử lý</th><th>Kết quả</th></tr></thead>
          <tbody>{reports.data?.items.map(report => <tr key={first(report, 'id')}>
            <td><strong>{first(report, 'maintenanceCode')}</strong><br />{label(report.category)}</td>
            <td>{[first(report, 'facility.name'), first(report, 'unitCode')].filter(Boolean).join(' · ')}</td>
            <td>{date(report.createdAt, true)}</td>
            <td>{first(report, 'assignedStaff.fullName') || 'Chưa phân công'}</td>
            <td><Status value={report.status} />
              {first(report, 'workNote') && <p>{first(report, 'workNote')}</p>}
              {first(report, 'verificationNote') && <p>{first(report, 'verificationNote')}</p>}
              {first(report, 'verifiedBy.fullName') && <small>Nghiệm thu: {first(report, 'verifiedBy.fullName')}</small>}
            </td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </section>;
}
