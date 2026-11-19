import { useId, useRef, useState, type FormEvent } from 'react';
import { useListPagination } from '../workspace/useListPagination';
import { StaffTaskTable, type StaffColumn } from '../workspace/StaffTaskTable';
import { EntitySelect } from '../EntitySelect';
import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
import { usePaginatedResource } from '../../services/usePaginatedResource';
import { mutate } from '../../services/portal';
import { first, type Row } from './portal-data';
import { StaffPicker } from './StaffPicker';
import { Empty, LoadState, Modal } from './PortalUi';
import { ManagerTableSearch } from './ManagerTaskTable';
import { normalizeSearch } from '../../utils/notification-tools';

type Assignment = { id: string; storageUnitId: string; storageUnit: { unitNumber: string }; staff: { id: string; fullName: string; accountStatus: string }; assignedBy: { fullName: string } };

const columns: StaffColumn<Assignment>[] = [
  { key: 'unit', label: 'Kho', cell: item => <strong>{item.storageUnit.unitNumber}</strong> },
  { key: 'staff', label: 'Nhân viên phụ trách', cell: item => <>{item.staff.fullName}{item.staff.accountStatus !== 'ACTIVE' && <small>Cần đổi nhân viên</small>}</> },
  { key: 'manager', label: 'Người phân công', cell: item => item.assignedBy.fullName },
];

export function UnitStaffAssignments({ onSaved }: { onSaved: () => void }) {
  const { user } = useAuth();
  const assignments = useApiResource<{ enabled: boolean; items: Assignment[] }>('/manager/unit-staff-assignments', user?.id ?? '', true, true);
  const [editing, setEditing] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const records = assignments.data?.items ?? [];
  const matching = records.filter(item => normalizeSearch([item.storageUnit.unitNumber, item.staff.fullName].join(' ')).includes(normalizeSearch(search.trim())));
  const { items, pagination, reset } = useListPagination(matching, { page: 'unitsPage', limit: 'unitsLimit' });
  return <section className="manager-unit-assignments" aria-label="Phụ trách kho">
    <LoadState loading={assignments.loading} error={assignments.error} retry={assignments.refresh} />
    {assignments.data?.enabled === false && <p role="status">Phân công phụ trách kho chưa được bật.</p>}
    {assignments.data?.enabled && <>
      <div className="manager-unit-assignments-toolbar">
        <ManagerTableSearch value={search} onChange={value => { setSearch(value); reset(); }} placeholder="Mã kho hoặc tên nhân viên…" />
        <button type="button" className="button-primary" onClick={() => setEditing('')}>Phân công kho</button>
      </div>
      {notice && <p className="portal-success" role="status">{notice}</p>}
      {items.length ? <StaffTaskTable title="Danh sách kho có người phụ trách" columns={columns} items={items} rowKey={item => item.id}
        rowDetail={item => ({ open: () => setEditing(item.storageUnitId), label: `Thay đổi phụ trách kho ${item.storageUnit.unitNumber}` })} />
        : <Empty title={search ? 'Không tìm thấy kho phù hợp' : 'Chưa có kho được phân công'} description={search ? 'Thử mã kho hoặc tên nhân viên khác.' : 'Chọn Phân công kho để giao người phụ trách.'} />}
      {pagination}
      {editing !== null && <UnitAssignmentDialog initialUnit={editing} assignments={records} onClose={() => setEditing(null)} onSaved={message => {
        setEditing(null);
        setNotice(message);
        assignments.refresh();
        onSaved();
      }} />}
    </>}
  </section>;
}

function UnitAssignmentDialog({ initialUnit, assignments, onClose, onSaved }: { initialUnit: string; assignments: Assignment[]; onClose: () => void; onSaved: (message: string) => void }) {
  const { user } = useAuth();
  const units = usePaginatedResource<Row>(initialUnit ? null : '/manager/units?limit=100', user?.id ?? '');
  const formId = useId();
  const lock = useRef(false);
  const [unitId, setUnitId] = useState(initialUnit);
  const [staffId, setStaffId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const current = assignments.find(item => item.storageUnitId === unitId);
  const close = () => {
    if (busy || (staffId || unitId !== initialUnit) && !window.confirm('Bỏ phân công kho chưa lưu?')) return;
    onClose();
  };
  const save = async (nextStaffId: string | null) => {
    if (lock.current || !unitId || !nextStaffId && !current || nextStaffId === current?.staff.id) return;
    if (nextStaffId === null && !window.confirm('Thu hồi phân công phụ trách kho này?')) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await mutate(`/manager/units/${encodeURIComponent(unitId)}/staff-assignment`, 'PATCH', { staffUserId: nextStaffId, expectedAssignmentId: current?.id ?? null });
      onSaved(nextStaffId ? 'Đã lưu nhân viên phụ trách kho.' : 'Đã thu hồi phân công phụ trách kho.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không lưu được phân công.');
    } finally { lock.current = false; setBusy(false); }
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (staffId) void save(staffId);
  };
  return <Modal title="Phân công phụ trách kho" onClose={close} busy={busy} className="assignment-dialog unit-assignment-dialog" footer={<>
    {current && <button type="button" className="button-secondary" disabled={busy} onClick={() => void save(null)}>Thu hồi</button>}
    <button type="button" className="button-secondary" disabled={busy} onClick={close}>Hủy</button>
    <button type="submit" form={formId} className="button-primary" disabled={busy || !unitId || !staffId || current?.staff.id === staffId}>
      {busy ? 'Đang lưu…' : current ? 'Xác nhận đổi nhân viên' : 'Xác nhận phân công'}
    </button>
  </>}>
    <form id={formId} className="portal-form" onSubmit={submit}>
      {initialUnit ? <p><strong>Kho {current?.storageUnit.unitNumber}</strong></p> : <>
        <LoadState loading={units.loading} error={units.error} retry={units.refresh} />
        {units.data && <label className="field-label">Kho
          <EntitySelect aria-label="Kho" value={unitId} required disabled={busy}
            onValueChange={value => { setUnitId(value); setStaffId(''); setError(''); }}>
            <option value="">Chọn kho</option>
            {units.data.items.map(unit => <option key={first(unit, 'id')} value={first(unit, 'id')}>{first(unit, 'unitCode')} · {first(unit, 'storageType.name')}</option>)}
          </EntitySelect>
        </label>}
      </>}
      {current && <p>Đang phụ trách <strong>{current.staff.fullName}</strong></p>}
      {error && <p role="alert" className="booking-alert is-error">{error}</p>}
      {unitId && <StaffPicker list value={staffId} onChange={value => { setStaffId(value); setError(''); }} disabled={busy} />}
    </form>
  </Modal>;
}
